# GDPR & Compliance

> **ID:** D13
> **Status:** Review
> **Priority:** P2
> **Last updated:** 2026-03-10
> **Depends on:** D01 (schema — audit_logs, gdpr_erasure_log, candidate_dei_data, candidate_encryption_keys), D09 (Candidate Portal — consent collection, erasure request flow)
> **Depended on by:** D17 (Analytics — DEI aggregation rules), D18 (Security Runbooks — incident response procedures)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-007 (audit logging), ADR-010 (GDPR erasure + crypto-shredding)

---

## 1. Overview

GDPR & Compliance defines the processes, automation, and controls that ensure the ATS meets privacy regulations (GDPR, CCPA, PIPEDA), employment law requirements (EEO, anti-discrimination), and security standards (SOC 2 Type II readiness). This builds on the database-level primitives already implemented (ADR-007 audit logging, ADR-010 crypto-shredding erasure) and specifies the operational flows around them.

**Scope:**
- In scope: DSAR (Data Subject Access Request) flow, right to erasure automation, data retention policies, consent management with versioning, DEI data aggregation rules (G-019), audit log compliance queries, SOC 2 control mapping, CCPA requirements, data region awareness.
- Out of scope: SOC 2 audit engagement (external auditor process), legal text drafting (privacy policies), DPA (Data Processing Agreement) negotiation, HIPAA (not applicable to ATS).

## 2. Regulatory Landscape

| Regulation | Applicability | Key Rights | ATS Impact |
|-----------|---------------|------------|------------|
| **GDPR** (EU/EEA) | Orgs processing EU resident data | Access, rectification, erasure, portability, restrict processing | Full DSAR flow, consent management, data minimization, DPO contact |
| **UK GDPR** | Orgs processing UK resident data | Same as GDPR (post-Brexit mirror) | Same as GDPR; separate legal basis tracking |
| **CCPA/CPRA** (California) | Orgs with CA employees/candidates | Right to know, delete, opt-out of sale, limit sensitive data use | Disclosure at collection, deletion requests, no "sale" of candidate data |
| **PIPEDA** (Canada) | Orgs processing Canadian data | Access, correction, withdrawal of consent | Consent management, breach notification |
| **EEO/EEOC** (US) | US employers 15+ employees | Non-discriminatory hiring practices | DEI data collection (voluntary), EEO-1 reporting |

**Approach:** The ATS implements the most restrictive requirements (GDPR) as the baseline. Jurisdiction-specific variations are handled via configuration, not code branching.

## 3. Data Subject Access Request (DSAR) Flow

### 3.1 Request Channels

| Channel | Implementation |
|---------|---------------|
| Candidate portal | "Delete my data" button (D09 §11) — triggers erasure DSAR |
| Candidate portal | "Download my data" button (new) — triggers access/portability DSAR |
| Email | Candidate emails org privacy contact → admin creates DSAR manually |
| API | `POST /api/v1/compliance/dsar` — admin-initiated on behalf of candidate |

### 3.2 DSAR Types

| Type | GDPR Article | Response Deadline | Output |
|------|-------------|-------------------|--------|
| **Access** (SAR) | Art. 15 | 30 days | JSON + PDF export of all candidate data |
| **Portability** | Art. 20 | 30 days | Machine-readable JSON export |
| **Erasure** | Art. 17 | 30 days (48h internal SLA) | Crypto-shredding + anonymization |
| **Rectification** | Art. 16 | 30 days | Admin updates candidate record |
| **Restriction** | Art. 18 | 72 hours | Flag candidate as processing-restricted |

### 3.3 DSAR Processing Flow

```
1. Request received (portal / email / API)
2. Identity verification
   - Portal: already authenticated via magic link token
   - Email: admin verifies identity (email match + ID document if required)
3. DSAR created in system
   - Insert into dsar_requests tracking (metadata in organizations.metadata)
   - Assign to org admin for review
4. Data assembly (automated via Inngest)
   - Access/Portability: collect all candidate data across tables
   - Erasure: queue erase_candidate() with 48h cooling period
5. Review + approval (admin)
   - Verify no legal hold or legitimate interest override
6. Execute
   - Access: generate export, send download link to candidate
   - Erasure: execute crypto-shredding
7. Confirmation
   - Notify candidate of completion
   - Log in gdpr_erasure_log (erasure) or audit_logs (access)
```

### 3.4 Data Export Assembly

```typescript
// Inngest function: assemble candidate data export
export const complianceDSARExport = inngest.createFunction(
  { id: 'compliance-dsar-export', retries: 2 },
  { event: 'compliance/dsar-export' },
  async ({ event, step }) => {
    const { organization_id, candidate_id } = event.data;
    const supabase = createServiceClient();

    const exportData = await step.run('assemble-data', async () => {
      // Collect all candidate data across tables
      const [candidate, applications, interviews, scorecards,
             notes, offers, files, skills, pools, dei, customFields] =
        await Promise.all([
          supabase.from('candidates').select('*').eq('id', candidate_id).single(),
          supabase.from('applications').select('*, stage_history:application_stage_history(*)')
            .eq('candidate_id', candidate_id).is('deleted_at', null),
          supabase.from('interviews').select('*')
            .in('application_id', applicationIds).is('deleted_at', null),
          supabase.from('scorecard_submissions').select('*, ratings:scorecard_ratings(*)')
            .in('application_id', applicationIds).is('deleted_at', null),
          supabase.from('notes').select('*')
            .eq('candidate_id', candidate_id).is('deleted_at', null),
          supabase.from('offers').select('*')
            .in('application_id', applicationIds).is('deleted_at', null),
          supabase.from('files').select('*')
            .eq('entity_type', 'candidate').eq('entity_id', candidate_id).is('deleted_at', null),
          supabase.from('candidate_skills').select('*, skill:skills(*)')
            .eq('candidate_id', candidate_id).is('deleted_at', null),
          supabase.from('talent_pool_members').select('*, pool:talent_pools(*)')
            .eq('candidate_id', candidate_id).is('deleted_at', null),
          supabase.from('candidate_dei_data').select('*')
            .eq('candidate_id', candidate_id).is('deleted_at', null),
          supabase.from('custom_field_values').select('*, definition:custom_field_definitions(*)')
            .eq('entity_type', 'candidate').eq('entity_id', candidate_id).is('deleted_at', null),
        ]);

      return {
        exported_at: new Date().toISOString(),
        candidate: candidate.data,
        applications: applications.data,
        interviews: interviews.data,
        scorecards: scorecards.data,
        notes: notes.data,
        offers: offers.data,
        files: files.data?.map(f => ({ ...f, download_url: generateSignedUrl(f.storage_path) })),
        skills: skills.data,
        talent_pools: pools.data,
        dei_data: dei.data,
        custom_fields: customFields.data,
      };
    });

    // Generate downloadable file
    const fileUrl = await step.run('generate-export-file', async () => {
      const json = JSON.stringify(exportData, null, 2);
      const path = `exports/${organization_id}/dsar-${candidate_id}-${Date.now()}.json`;

      await supabaseAdmin.storage
        .from('compliance-exports')
        .upload(path, json, { contentType: 'application/json' });

      // Signed URL expires in 7 days
      const { data } = await supabaseAdmin.storage
        .from('compliance-exports')
        .createSignedUrl(path, 7 * 24 * 60 * 60);

      return data.signedUrl;
    });

    // Notify candidate with download link
    await step.run('notify-candidate', async () => {
      await inngest.send({
        name: 'notification/dispatch',
        data: {
          organization_id,
          event_type: 'candidate.dsar_export_ready',
          payload: { candidate_id, download_url: fileUrl },
        },
      });
    });

    return { exported: true, candidate_id };
  }
);
```

### 3.5 Erasure Execution

Erasure uses the existing `erase_candidate()` function (D01 §GDPR) with the 48-hour cooling period defined in D09 §11. The Inngest function:

1. Checks cancellation flag before executing
2. Calls `erase_candidate(p_candidate_id, p_org_id)` — anonymizes candidate, soft-deletes all related records, deletes encryption keys
3. Deletes physical files from Supabase Storage (resumes, cover letters)
4. Logs to `gdpr_erasure_log`
5. Sends confirmation email to candidate's original email (captured before anonymization)

### 3.6 Legal Hold Override

If an organization has a legal hold on a candidate (e.g., pending litigation), erasure requests are **paused**, not denied:

- Admin marks candidate with `applications.metadata.legal_hold = true`
- Erasure function checks this flag and skips execution, logging the reason
- Admin receives notification to review when legal hold is lifted
- Candidate is notified: "Your request is being processed. Due to legal requirements, it may take additional time."

## 4. Data Retention Policies

### 4.1 Default Retention Periods

| Data Category | Default Retention | After Retention | Legal Basis |
|--------------|-------------------|-----------------|-------------|
| Active applications | Indefinite (while `status = 'active'`) | N/A | Legitimate interest |
| Rejected applications | 24 months from `rejected_at` | Auto-erase candidate if no other active apps | GDPR Art. 6(1)(f) |
| Withdrawn applications | 12 months from `withdrawn_at` | Auto-erase | Consent withdrawn |
| Hired candidate data | Duration of employment + 7 years | Archive, then erase | Legal obligation (tax, employment law) |
| Audit logs | 24 months (default) | Partition drop | SOC 2 + legal obligation |
| AI usage logs | 12 months | Purge | Billing reconciliation |
| Files (resumes, etc.) | Same as candidate retention | Delete from Storage | Follows candidate lifecycle |
| DEI data | 36 months (EEO-1 reporting cycle) | Aggregate, then erase individual | Legal obligation (US) |

### 4.2 Retention Enforcement Cron

```typescript
export const complianceRetentionCron = inngest.createFunction(
  { id: 'compliance-retention-cron' },
  { cron: '0 3 * * 0' }, // Weekly, Sunday 3am UTC
  async ({ step }) => {
    const supabase = createServiceClient();

    // 1. Find candidates eligible for retention-based erasure
    const candidates = await step.run('find-expired-candidates', async () => {
      // Rejected > 24 months ago with no other active applications
      const { data } = await supabase.rpc('find_retention_expired_candidates', {
        rejected_threshold: '24 months',
        withdrawn_threshold: '12 months',
      });
      return data;
    });

    // 2. Process each candidate
    for (const candidate of candidates ?? []) {
      await step.run(`erase-${candidate.id}`, async () => {
        await supabase.rpc('erase_candidate', {
          p_candidate_id: candidate.id,
          p_org_id: candidate.organization_id,
        });

        // Delete files from storage
        await deleteStorageFiles(candidate.id, candidate.organization_id);
      });
    }

    // 3. Drop old audit log partitions (> 24 months)
    await step.run('drop-old-partitions', async () => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 24);
      const partitionName = `audit_logs_${cutoff.getFullYear()}_${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

      // Only drop if partition exists and is beyond retention
      await supabase.rpc('drop_audit_partition_if_exists', {
        partition_name: partitionName,
      });
    });

    return { processed: candidates?.length ?? 0 };
  }
);
```

### 4.3 SQL Helper: Find Retention-Expired Candidates

```sql
CREATE OR REPLACE FUNCTION find_retention_expired_candidates(
  rejected_threshold INTERVAL DEFAULT '24 months',
  withdrawn_threshold INTERVAL DEFAULT '12 months'
)
RETURNS TABLE (id UUID, organization_id UUID, reason TEXT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT c.id, c.organization_id,
    CASE
      WHEN a.status = 'rejected' THEN 'retention_expiry_rejected'
      WHEN a.status = 'withdrawn' THEN 'retention_expiry_withdrawn'
    END AS reason
  FROM candidates c
  JOIN applications a ON a.candidate_id = c.id AND a.deleted_at IS NULL
  WHERE c.deleted_at IS NULL
    AND c.is_anonymized = FALSE
    AND (
      (a.status = 'rejected' AND a.rejected_at < NOW() - rejected_threshold)
      OR (a.status = 'withdrawn' AND a.withdrawn_at < NOW() - withdrawn_threshold)
    )
    -- No active applications for this candidate in the same org
    AND NOT EXISTS (
      SELECT 1 FROM applications a2
      WHERE a2.candidate_id = c.id
        AND a2.organization_id = c.organization_id
        AND a2.status = 'active'
        AND a2.deleted_at IS NULL
    );
$$;
```

### 4.4 Per-Organization Override

Organizations can set custom retention periods via Settings → Compliance:

```typescript
// Stored in organizations.metadata.retention_config
interface RetentionConfig {
  rejected_months: number;   // Default: 24, min: 6, max: 84
  withdrawn_months: number;  // Default: 12, min: 3, max: 36
  audit_log_months: number;  // Default: 24, min: 12, max: 84
}
```

Enterprise plans can extend retention. Starter/Growth plans use defaults.

## 5. Consent Management

### 5.1 Consent Records

Each consent interaction is tracked with version information:

```typescript
// Stored in applications.metadata.gdpr_consent
interface ConsentRecord {
  consented_at: string;       // ISO 8601
  ip_address: string;
  consent_version: string;    // e.g., "2026-03-01" — matches privacy policy version
  consent_text: string;       // Exact text shown to candidate
  jurisdiction: 'gdpr' | 'ccpa' | 'pipeda' | 'general';
  purposes: ConsentPurpose[];
}

type ConsentPurpose =
  | 'recruitment_processing'   // Core — always required
  | 'talent_pool_retention'    // Optional — future job consideration
  | 'dei_collection';          // Optional — voluntary demographic data
```

### 5.2 Consent Versioning

- **Privacy policy version:** Stored in `organizations.metadata.privacy_policy_version` (date string).
- **On policy update:** New applications get the new version. Existing consents remain valid under the old version.
- **Re-consent not required** for existing applications unless processing purposes change.

### 5.3 Consent Withdrawal

Candidates can withdraw consent via the status tracker page (D09 §6). Withdrawal triggers:

1. Application status → `withdrawn` (consent withdrawal = withdrawal of application)
2. If `talent_pool_retention` consent withdrawn → remove from all talent pools
3. If `dei_collection` consent withdrawn → soft-delete `candidate_dei_data`
4. Retention clock starts from withdrawal date

### 5.4 CCPA-Specific Requirements

| Requirement | Implementation |
|-------------|---------------|
| Right to Know (at collection) | Application form displays data collection notice before submit |
| Right to Delete | Same flow as GDPR erasure (§3) |
| Right to Opt-Out of Sale | N/A — ATS does not sell candidate data. Disclosure posted. |
| Right to Limit Sensitive Data | DEI collection is opt-in only. No profiling. |
| Non-discrimination | Consent/erasure choices do not affect application processing |

## 6. DEI Data Handling (G-019 Resolution)

### 6.1 Collection

- **Voluntary:** DEI data is never required. Separate opt-in checkbox with dedicated `dei_collection` consent purpose.
- **Timing:** Collected post-application (separate form linked from confirmation email), never during initial application.
- **Isolation:** Stored in `candidate_dei_data.data` JSONB. RLS restricts to owner/admin only — hiring team never sees individual DEI data.

### 6.2 Data Fields

```typescript
interface DEIData {
  gender?: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';
  ethnicity?: string[];       // Multi-select from EEO-1 categories
  veteran_status?: 'veteran' | 'non_veteran' | 'prefer_not_to_say';
  disability_status?: 'yes' | 'no' | 'prefer_not_to_say';
  age_range?: '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+' | 'prefer_not_to_say';
}
```

### 6.3 Aggregation Rules (G-019 Resolution)

To prevent de-identification of individuals in small cohorts:

| Rule | Threshold | Action |
|------|-----------|--------|
| **Minimum cohort size** | 5 candidates | If a demographic group has < 5 candidates, suppress that row in reports and show "< 5" |
| **Cross-tabulation limit** | No more than 2 dimensions | Cannot cross gender × ethnicity × veteran status (too granular) |
| **Suppression cascade** | If suppressing a row would reveal another row's value | Suppress both complementary rows |
| **Time window** | Minimum 3-month rolling window | No single-day or single-week DEI snapshots |

```typescript
// Aggregation function (server-side only)
function aggregateDEI(data: DEIRecord[], dimension: string): AggregatedRow[] {
  const groups = groupBy(data, dimension);
  const MIN_COHORT = 5;

  return Object.entries(groups).map(([value, records]) => ({
    dimension: value,
    count: records.length >= MIN_COHORT ? records.length : null,
    percentage: records.length >= MIN_COHORT
      ? (records.length / data.length * 100).toFixed(1)
      : null,
    suppressed: records.length < MIN_COHORT,
  }));
}
```

### 6.4 EEO-1 Reporting

For US organizations with 100+ employees:
- **Export format:** CSV matching EEOC Component 1 format
- **Job categories:** Mapped from `job_openings.department` to EEO-1 job categories (admin-configured mapping)
- **Report period:** Annual (calendar year)
- **Available on:** Pro and Enterprise plans only

## 7. Audit Log Compliance

### 7.1 Compliance Query Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/compliance/audit-logs` | JWT (admin) | Query audit logs with filters |
| GET | `/api/v1/compliance/audit-logs/export` | JWT (owner) | Export audit logs as CSV/JSON |
| GET | `/api/v1/compliance/audit-logs/:recordId/history` | JWT (admin) | Full history for a specific record |

### 7.2 Query Filters

```typescript
interface AuditLogQuery {
  table_name?: string;       // Filter by table
  record_id?: string;        // History for specific record
  performed_by?: string;     // Actions by specific user
  action?: 'INSERT' | 'UPDATE' | 'DELETE';
  date_from?: string;        // ISO 8601
  date_to?: string;
  cursor?: string;           // Pagination cursor
  limit?: number;            // Default: 50, max: 200
}
```

### 7.3 Audit Log Export

Bulk export for compliance reviews. Available to org owners only.

- **Format:** JSON Lines (`.jsonl`) or CSV
- **Scope:** Date range + optional table filter
- **Delivery:** Generated async via Inngest → uploaded to `compliance-exports` bucket → signed URL emailed to requester
- **Size limit:** 100,000 records per export. Larger ranges split into multiple files.

### 7.4 Immutability Proof

For SOC 2 auditors:
- Audit logs table has `UPDATE` and `DELETE` policies set to `USING (FALSE)` — no mutations possible via RLS.
- Service role access is restricted to the `audit_trigger_func()` SECURITY DEFINER function.
- Monthly partitions enable efficient retention without row-level deletes.
- `performed_by` is set via `auth.uid()` or `current_setting('app.performed_by')` — not client-supplied.

## 8. SOC 2 Type II Control Mapping

### 8.1 Trust Service Criteria Coverage

| Category | Control | ATS Implementation |
|----------|---------|-------------------|
| **Security** | Access control | RLS on all tables, JWT-based auth, role-based permissions |
| **Security** | Encryption at rest | Supabase manages (AES-256 for storage, TDE for database) |
| **Security** | Encryption in transit | TLS 1.2+ enforced on all endpoints |
| **Security** | Audit logging | ADR-007: trigger-based, append-only, monthly partitions |
| **Security** | Vulnerability management | Dependabot + Snyk in CI/CD (D15) |
| **Availability** | Uptime SLO | 99.9% target (Supabase + Vercel SLAs) |
| **Availability** | Disaster recovery | Database backups (Supabase PITR), runbook (D18) |
| **Confidentiality** | Data classification | PII fields identified, DEI data isolated, crypto-shredding |
| **Confidentiality** | Data retention | Automated retention cron (§4.2), configurable per org |
| **Processing Integrity** | Input validation | Zod schemas on all API inputs (D02) |
| **Processing Integrity** | Idempotency | Idempotency keys on mutation endpoints (D02 §6) |
| **Privacy** | Consent management | Per-application consent with versioning (§5) |
| **Privacy** | DSAR processing | Automated export + erasure flows (§3) |
| **Privacy** | Data minimization | Collect only required fields, DEI is opt-in |

### 8.2 Evidence Collection

SOC 2 auditors need:
1. **Access review logs:** Audit log export filtered by `table_name = 'organization_members'`
2. **Change management:** Git history + DEVLOG (documentation) + audit logs (runtime)
3. **Incident response:** D18 Security Runbooks
4. **Encryption proof:** Supabase infrastructure documentation
5. **Retention proof:** `gdpr_erasure_log` entries + retention cron execution logs

## 9. Data Region Awareness

### 9.1 Region Configuration

```typescript
// organizations.data_region values
type DataRegion = 'us-east-1' | 'eu-west-1' | 'ap-southeast-1';

// Jurisdiction mapping
const REGION_JURISDICTION: Record<DataRegion, string[]> = {
  'us-east-1': ['ccpa', 'general'],
  'eu-west-1': ['gdpr', 'uk_gdpr'],
  'ap-southeast-1': ['pipeda', 'general'],
};
```

### 9.2 Jurisdiction-Driven Behavior

| Behavior | GDPR (EU) | CCPA (US) | General |
|----------|-----------|-----------|---------|
| Consent checkbox text | GDPR-specific with legal basis | CCPA notice at collection | Generic consent |
| Erasure cooling period | 48 hours | 45 days response window | 48 hours |
| DEI collection | Optional, post-application | Optional, post-application | Optional |
| Data export format | JSON (machine-readable, Art. 20) | "Readily usable format" | JSON |
| Retention defaults | 24 months rejected | 24 months rejected | 24 months rejected |

### 9.3 Limitations

Data region is informational in MVP — all data is stored in the Supabase project's region (single-region deployment). Multi-region data residency enforcement is a post-MVP feature requiring Supabase project-per-region architecture. The `data_region` field enables future migration without schema changes.

## 10. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/compliance/dsar` | JWT (admin) | Create DSAR request |
| GET | `/api/v1/compliance/dsar/:id` | JWT (admin) | Get DSAR status |
| POST | `/api/v1/compliance/dsar/:id/execute` | JWT (owner) | Approve and execute DSAR |
| GET | `/api/v1/compliance/audit-logs` | JWT (admin) | Query audit logs |
| GET | `/api/v1/compliance/audit-logs/export` | JWT (owner) | Export audit logs |
| GET | `/api/v1/compliance/retention` | JWT (admin) | Get retention config |
| PUT | `/api/v1/compliance/retention` | JWT (owner) | Update retention config |
| GET | `/api/v1/compliance/dei/aggregate` | JWT (owner/admin) | Aggregated DEI report |
| GET | `/api/v1/compliance/dei/export` | JWT (owner) | EEO-1 CSV export |
| GET | `/api/v1/compliance/consent/:applicationId` | JWT | Get consent record for application |

## 11. Inngest Functions

| Function ID | Trigger | Purpose |
|-------------|---------|---------|
| `compliance-dsar-export` | `compliance/dsar-export` | Assemble and deliver candidate data export |
| `compliance-retention-cron` | `cron: 0 3 * * 0` (weekly) | Find and erase retention-expired candidates |
| `compliance-audit-export` | `compliance/audit-export` | Generate bulk audit log export file |
| `compliance-dei-aggregate` | `compliance/dei-aggregate` | Generate aggregated DEI report with suppression |

## 12. Plan Gating

| Feature | Starter | Growth | Pro | Enterprise |
|---------|---------|--------|-----|------------|
| DSAR processing (manual) | ✅ | ✅ | ✅ | ✅ |
| Automated retention cron | ❌ | ✅ | ✅ | ✅ |
| Audit log query (30 days) | ✅ | ✅ | ✅ | ✅ |
| Audit log query (full history) | ❌ | ❌ | ✅ | ✅ |
| Audit log export | ❌ | ❌ | ✅ | ✅ |
| DEI collection | ❌ | ✅ | ✅ | ✅ |
| EEO-1 export | ❌ | ❌ | ✅ | ✅ |
| Custom retention periods | ❌ | ❌ | ❌ | ✅ |
| Data region selection | ❌ | ❌ | ❌ | ✅ |

## 13. Security Considerations

- **DSAR verification:** Portal requests use magic link tokens (pre-verified identity). Manual requests require admin identity verification before execution.
- **Export file security:** DSAR exports stored in private Supabase Storage bucket. Signed URLs expire after 7 days. Files auto-deleted after 30 days.
- **DEI data isolation:** Individual DEI records never exposed via API. Only aggregated data with cohort suppression is accessible.
- **Consent immutability:** Consent records in `applications.metadata` are append-only (new consent versions don't overwrite old ones). Audit trigger captures all changes.
- **Encryption key deletion:** `candidate_encryption_keys` deletion is irreversible — this is intentional (crypto-shredding). No soft-delete on this table.
- **Admin action logging:** All compliance actions (DSAR creation, execution, export) are logged in audit_logs with the admin's `user_id`.
- **Retention cron safety:** The cron function runs as service role but logs each erasure to `gdpr_erasure_log`. Dry-run mode available via feature flag.
