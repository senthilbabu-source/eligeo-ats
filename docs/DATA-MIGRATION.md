# Data Migration & Import Strategy

> **ID:** D23
> **Status:** Review
> **Priority:** P1
> **Last updated:** 2026-03-11
> **Depends on:** D01 (schema — target tables), D19 (Onboarding — Merge.dev integration, CSV import)
> **Depended on by:** —
> **Last validated against deps:** 2026-03-11
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-006 (soft delete), ADR-008 (enum strategy), ADR-009 (file storage)

---

## 1. Overview

This document extends D19's migration framework with competitor-specific field mapping, staging table design, data validation rules, error recovery, and rollback strategy. D19 defines the flow; this document defines the data transformation layer.

**Scope:**
- In scope: Competitor field mapping (Greenhouse, Lever, Ashby, BambooHR, Workable), staging tables, validation pipeline, error handling, rollback, data quality assessment, migration testing.
- Out of scope: Merge.dev OAuth flow (D19 §5), onboarding wizard (D19 §3), CSV import basics (D19 §4), billing migration (handled by Stripe).

**Relationship to D19:** D19 owns the Inngest functions and API endpoints. D23 owns the data transformation logic those functions call.

---

## 2. Migration Architecture

### 2.1 Pipeline Stages

```
Source ATS (via Merge.dev)
        │
        ▼
┌─────────────────┐
│  1. EXTRACT      │  Merge.dev normalized API → raw JSON
│     (Inngest)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. STAGE        │  Write to staging tables (unvalidated)
│     (DB)         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. TRANSFORM    │  Competitor-specific field mapping + normalization
│     (Inngest)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. VALIDATE     │  Zod schema validation, dedup, referential integrity
│     (Inngest)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. LOAD         │  Insert into production tables (batched, transactional)
│     (DB)         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  6. VERIFY       │  Count reconciliation, integrity checks, search sync
│     (Inngest)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  7. REPORT       │  Migration summary → admin notification
│     (Inngest)    │
└─────────────────┘
```

### 2.2 Design Principles

1. **Staging first:** Never write directly to production tables. All data passes through staging for validation.
2. **Idempotent:** Re-running migration on the same source data produces the same result. Dedup by `source_id`.
3. **Resumable:** Each stage records progress. Failed migrations can resume from the last successful stage.
4. **Auditable:** Every record tracks its source system and original ID for traceability.
5. **Non-destructive:** Failed migration data stays in staging for inspection. Production data is never modified during import (insert-only).

---

## 3. Staging Tables

Temporary tables that hold migrated data before validation and insertion into production.

### 3.1 Schema

```sql
-- Migration job tracking
CREATE TABLE migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  source_system TEXT NOT NULL,  -- 'greenhouse', 'lever', 'ashby', 'bamboohr', 'workable', 'csv'
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracting', 'staging', 'transforming', 'validating', 'loading', 'verifying', 'completed', 'failed', 'rolled_back')),
  merge_account_token TEXT,     -- Merge.dev linked account token (encrypted)
  config JSONB NOT NULL DEFAULT '{}',  -- Stage mapping, options
  progress JSONB NOT NULL DEFAULT '{}',
  -- Progress shape: { extracted: 0, staged: 0, validated: 0, loaded: 0, errors: 0 }
  error_log JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES user_profiles(id)
);

-- Staged candidate records (pre-validation)
CREATE TABLE staging_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,           -- Original ID in source system
  source_data JSONB NOT NULL,        -- Raw Merge.dev normalized record
  mapped_data JSONB,                 -- After field transformation
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid', 'duplicate', 'loaded')),
  validation_errors JSONB DEFAULT '[]',
  target_id UUID,                    -- Set after successful load to production
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staging_candidates_job ON staging_candidates(migration_job_id);
CREATE INDEX idx_staging_candidates_status ON staging_candidates(migration_job_id, validation_status);

-- Staged application records
CREATE TABLE staging_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_candidate_id TEXT NOT NULL,  -- FK to source candidate
  source_job_id TEXT NOT NULL,        -- FK to source job
  source_data JSONB NOT NULL,
  mapped_data JSONB,
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid', 'duplicate', 'loaded')),
  validation_errors JSONB DEFAULT '[]',
  target_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staging_applications_job ON staging_applications(migration_job_id);

-- Staged job records
CREATE TABLE staging_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_data JSONB NOT NULL,
  mapped_data JSONB,
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid', 'duplicate', 'loaded')),
  validation_errors JSONB DEFAULT '[]',
  target_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staging_jobs_job ON staging_jobs(migration_job_id);

-- Staged interview records
CREATE TABLE staging_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_application_id TEXT NOT NULL,
  source_data JSONB NOT NULL,
  mapped_data JSONB,
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid', 'duplicate', 'loaded')),
  validation_errors JSONB DEFAULT '[]',
  target_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staged offer records
CREATE TABLE staging_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_application_id TEXT NOT NULL,
  source_data JSONB NOT NULL,
  mapped_data JSONB,
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid', 'duplicate', 'loaded')),
  validation_errors JSONB DEFAULT '[]',
  target_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 Cleanup

Staging tables are cleaned up after migration:
- **On success:** Staging data retained for 30 days (audit trail), then purged by retention cron.
- **On failure:** Staging data retained indefinitely until admin explicitly deletes or re-runs.
- **Cleanup function:** `DELETE FROM staging_* WHERE migration_job_id = $1`.

---

## 4. Competitor Field Mapping

### 4.1 Merge.dev Normalized Schema

Merge.dev normalizes ATS data into a common schema. Our transformation maps from Merge.dev's schema to ours. Competitor-specific transformations handle edge cases that Merge.dev doesn't normalize.

### 4.2 Candidate Mapping

| Merge.dev Field | Eligeo Field | Transform | Notes |
|----------------|------------------|-----------|-------|
| `first_name` + `last_name` | `candidates.full_name` | Concatenate with space | Merge.dev splits name; we use full_name |
| `email_addresses[0].value` | `candidates.email` | Take primary email | Validate email format |
| `phone_numbers[0].value` | `candidates.phone` | Take primary phone | Normalize format (+country code) |
| `company` | `candidates.current_company` | Direct | Truncate to 200 chars |
| `title` | `candidates.current_title` | Direct | Truncate to 200 chars |
| `locations[0]` | `candidates.location` | Format: `city, state, country` | Merge.dev provides structured location |
| `urls` (type=LINKEDIN) | `candidates.linkedin_url` | Extract LinkedIn URL | Validate URL format |
| `tags` | `candidates.tags` | Direct array | — |
| `applications` | (separate table) | — | Mapped in §4.3 |
| `attachments` | `files` table + Storage | Download and re-upload | See §4.6 |
| `remote_created_at` | `candidates.created_at` | Preserve original timestamp | For historical accuracy |

### 4.3 Application Mapping

| Merge.dev Field | Eligeo Field | Transform | Notes |
|----------------|------------------|-----------|-------|
| `id` | `staging_applications.source_id` | Reference | For dedup |
| `candidate` | `applications.candidate_id` | Resolve via staging lookup | Must map to loaded candidate |
| `job` | `applications.job_opening_id` | Resolve via staging lookup | Must map to loaded job |
| `current_stage` | `applications.current_stage_id` | Stage mapping (admin-configured, D19 §5.3) | User maps source → target stages |
| `reject_reason` | `applications.rejection_reason_id` | Match by name or create | Lookup table (ADR-008) |
| `applied_at` | `applications.created_at` | Preserve original | — |
| `rejected_at` | `applications.rejected_at` | Direct | — |
| `source` | `applications.source_id` | Match or create `candidate_sources` | Lookup table |

### 4.4 Job Mapping

| Merge.dev Field | Eligeo Field | Transform | Notes |
|----------------|------------------|-----------|-------|
| `name` | `job_openings.title` | Direct | Truncate to 200 chars |
| `departments[0].name` | `job_openings.department` | Direct | — |
| `offices[0]` | `job_openings.location` | Format location | — |
| `status` | `job_openings.status` | Map: `OPEN`→`open`, `CLOSED`→`closed`, `DRAFT`→`draft` | |
| `description` | `job_openings.description` | HTML → sanitized HTML | Strip dangerous tags |
| `remote_created_at` | `job_openings.created_at` | Preserve | — |
| `job_postings[0].location_type` | `job_openings.location_type` | Map: `IN_PERSON`→`onsite`, `REMOTE`→`remote`, `HYBRID`→`hybrid` | |

### 4.5 Competitor-Specific Transformations

Even with Merge.dev normalization, each source ATS has quirks:

#### Greenhouse

| Quirk | Handling |
|-------|---------|
| Stage names include prefixes ("1. Phone Screen") | Strip numeric prefixes during stage mapping display |
| Scorecards use "Overall recommendation" field | Map to note with `[Migrated Scorecard]` prefix |
| Custom fields stored as key-value pairs | Map to `custom_field_values` where matching definitions exist, log unmapped fields |
| Rejection reasons are free-text | Create `rejection_reasons` entries, dedup by exact text match |
| EEOC data in separate object | Map to `candidate_dei_data` if consent exists, skip otherwise |

#### Lever

| Quirk | Handling |
|-------|---------|
| "Opportunities" = our Applications | Direct mapping |
| Feedback = our Scorecard submissions | Map to notes (scorecards have different structure) |
| Sources include UTM parameters | Store full source string in `candidate_sources.name` |
| Tags are heavily used (100+ per org) | Import all as `candidates.tags`, warn if > 50 per candidate |
| Archive reasons ≠ rejection reasons | Map archive reasons to rejection reasons where possible |

#### Ashby

| Quirk | Handling |
|-------|---------|
| Highly structured scorecard templates | Best mapping to our scorecard system. Preserve structure. |
| "Signal" ratings (Strong Yes → No) | Map to numeric: Strong Yes=5, Yes=4, Neutral=3, No=2, Strong No=1 |
| Application history is comprehensive | Map to `application_stage_history` entries |
| Custom fields have types | Direct mapping to `custom_field_definitions` types |

#### BambooHR

| Quirk | Handling |
|-------|---------|
| ATS is limited — fewer data points | Simpler migration, fewer fields to map |
| No scorecard structure | All interview feedback → notes |
| Employee data mixed with candidate data | Filter: only import records with `is_candidate = true` |
| Job statuses don't match | Map: `Open`→`open`, `Filled`→`closed`, `Cancelled`→`closed` |

#### Workable

| Quirk | Handling |
|-------|---------|
| Disqualification reasons per stage | Map to single `rejection_reasons` per application |
| AI-sourced candidates marked separately | Set source to `ai_sourced` in `candidate_sources` |
| Evaluation forms = scorecards | Map to notes (structure differs) |
| Job departments may be nested | Flatten to single department string |

---

## 5. Validation Pipeline

### 5.1 Validation Rules

Applied to each staged record after transformation:

#### Candidate Validation

```typescript
const migratedCandidateSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email().max(255),
  phone: z.string().max(50).nullable(),
  current_title: z.string().max(200).nullable(),
  current_company: z.string().max(200).nullable(),
  location: z.string().max(200).nullable(),
  linkedin_url: z.string().url().nullable().or(z.literal('')).or(z.null()),
  tags: z.array(z.string().max(100)).max(50).default([]),
  created_at: z.string().datetime().optional(),
});
```

#### Application Validation

```typescript
const migratedApplicationSchema = z.object({
  candidate_id: z.string().uuid(),      // Resolved from staging
  job_opening_id: z.string().uuid(),     // Resolved from staging
  current_stage_id: z.string().uuid(),   // From stage mapping
  status: z.enum(['active', 'rejected', 'withdrawn', 'hired']),
  rejected_at: z.string().datetime().nullable(),
  created_at: z.string().datetime().optional(),
});
```

### 5.2 Deduplication Rules

| Entity | Dedup Key | On Duplicate |
|--------|-----------|-------------|
| Candidates | `(organization_id, email)` | Skip — mark staging record as `duplicate`, link `target_id` to existing |
| Jobs | `(organization_id, title, department)` | Skip — mark as `duplicate` |
| Applications | `(candidate_id, job_opening_id)` | Skip — one application per job per candidate |
| Interviews | `(application_id, scheduled_at)` | Skip if same time slot |

### 5.3 Referential Integrity

Before loading, verify:
1. Every `staging_applications.source_candidate_id` maps to a valid `staging_candidates` record (status = `valid` or `loaded`)
2. Every `staging_applications.source_job_id` maps to a valid `staging_jobs` record
3. Stage mapping covers all source stages present in the data (warn on unmapped)
4. Every `staging_interviews.source_application_id` maps to a valid application

Records with broken references are marked `invalid` with descriptive error.

---

## 6. Error Handling

### 6.1 Error Categories

| Category | Example | Action | Blocking? |
|----------|---------|--------|-----------|
| **Schema invalid** | Missing required field (email) | Mark record `invalid`, log error, continue | No |
| **Duplicate** | Candidate email already exists | Mark `duplicate`, link to existing, continue | No |
| **Reference broken** | Application references non-existent job | Mark `invalid`, log, continue | No |
| **Stage unmapped** | Application in stage not in mapping | Mark `invalid`, prompt admin to update mapping | Yes (pauses) |
| **Rate limited** | Merge.dev API throttled | Retry with backoff (Inngest handles) | Temporary |
| **Transform error** | Unexpected data format from source | Log raw data, mark `invalid`, continue | No |
| **Load error** | Database constraint violation | Log, mark `invalid`, continue | No |

### 6.2 Error Thresholds

| Metric | Warning | Abort |
|--------|---------|-------|
| Invalid records (% of total) | > 10% | > 30% |
| Consecutive load failures | 5 | 20 |
| Missing references (% of applications) | > 5% | > 20% |
| Transform errors | > 10 of same type | > 50 of same type |

When abort threshold is hit:
1. Migration status → `failed`
2. Admin notified with error summary
3. Staging data preserved for inspection
4. No production data modified (staging records with `loaded` status have already been inserted — partial load is valid)

### 6.3 Error Report

```typescript
interface MigrationReport {
  job_id: string;
  source_system: string;
  started_at: string;
  completed_at: string;
  status: 'completed' | 'completed_with_errors' | 'failed';

  summary: {
    candidates: { extracted: number; valid: number; duplicate: number; invalid: number; loaded: number };
    jobs: { extracted: number; valid: number; duplicate: number; invalid: number; loaded: number };
    applications: { extracted: number; valid: number; duplicate: number; invalid: number; loaded: number };
    interviews: { extracted: number; valid: number; duplicate: number; invalid: number; loaded: number };
    offers: { extracted: number; valid: number; duplicate: number; invalid: number; loaded: number };
  };

  errors: Array<{
    entity_type: string;
    source_id: string;
    error_category: string;
    message: string;
    source_data?: object;  // For debugging (PII-redacted in logs)
  }>;

  warnings: string[];  // Non-blocking issues
}
```

---

## 7. Rollback Strategy

### 7.1 Rollback Scope

Migration inserts new records — it never updates or deletes existing data. Rollback = soft-delete all records created by a migration job.

### 7.2 Rollback Mechanism

Every production record created during migration carries a metadata tag:

```typescript
// Added to every inserted record
{ metadata: { migration_job_id: '<job-id>', migrated_at: '<timestamp>' } }
```

Rollback function:

```typescript
async function rollbackMigration(jobId: string, orgId: string) {
  const supabase = createServiceClient();

  // Order matters: child records first (referential integrity)
  const tables = [
    'scorecard_ratings',
    'scorecard_submissions',
    'interviews',
    'offers',
    'application_stage_history',
    'applications',
    'talent_pool_members',
    'candidate_skills',
    'custom_field_values',
    'notes',
    'candidates',
    'job_openings',
  ];

  for (const table of tables) {
    await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .contains('metadata', { migration_job_id: jobId });
  }

  // Delete uploaded files from Storage
  const { data: files } = await supabase
    .from('files')
    .select('storage_path')
    .eq('organization_id', orgId)
    .contains('metadata', { migration_job_id: jobId });

  for (const file of files ?? []) {
    await supabaseAdmin.storage.from('attachments').remove([file.storage_path]);
  }

  // Soft-delete file metadata records
  await supabase
    .from('files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .contains('metadata', { migration_job_id: jobId });

  // Update migration job status
  await supabase
    .from('migration_jobs')
    .update({ status: 'rolled_back' })
    .eq('id', jobId);

  // Trigger Typesense re-sync to remove soft-deleted records
  await inngest.send({
    name: 'search/bulk-sync',
    data: { organization_id: orgId, entity_type: 'candidates' },
  });
}
```

### 7.3 Rollback Window

- **Admin-initiated:** Available for 30 days after migration completion
- **After 30 days:** Rollback still possible but requires owner confirmation (data may have been modified by users post-migration)
- **Partial rollback:** Not supported — rollback is all-or-nothing per migration job

---

## 8. File Migration

### 8.1 Attachment Handling

Source ATS files (resumes, cover letters, etc.) are migrated via Merge.dev's attachment API:

```
1. Merge.dev provides attachment download URLs
2. Inngest function downloads each file (with backoff/retry)
3. File uploaded to Supabase Storage: attachments/{org_id}/migrated/{candidate_id}/{filename}
4. files table record created with migration_job_id in metadata
5. Original Merge.dev URLs discarded after successful upload
```

### 8.2 File Limits

| Constraint | Value |
|------------|-------|
| Max file size | 10MB per file (same as application upload limit) |
| Supported types | PDF, DOCX, DOC, TXT, RTF, PNG, JPG |
| Oversized files | Logged as warning, skipped, noted in report |
| Missing files (404 from source) | Logged as warning, continue without file |
| Total storage per migration | Counted against org storage quota |

---

## 9. Data Quality Assessment

### 9.1 Pre-Migration Audit

Before starting migration, run a read-only audit of the source data:

```typescript
interface DataQualityReport {
  source_system: string;
  total_candidates: number;
  total_applications: number;
  total_jobs: number;

  quality_metrics: {
    candidates_with_email: number;       // Required field — must be > 95%
    candidates_with_name: number;        // Required field — must be 100%
    applications_with_stage: number;     // Needed for pipeline mapping
    jobs_with_department: number;        // Optional but useful
    duplicate_emails: number;            // Will be skipped
    orphan_applications: number;         // Applications without matching candidate
  };

  stage_inventory: Array<{
    source_stage_name: string;
    count: number;
    mapped: boolean;                     // After admin maps stages
  }>;

  estimated_duration_minutes: number;    // Based on record count
  warnings: string[];
}
```

### 9.2 Quality Gates

| Metric | Minimum | Action if Failed |
|--------|---------|------------------|
| Candidates with valid email | 95% | Warn admin, proceed (invalid ones skipped) |
| Applications with matching candidate | 90% | Warn admin, orphans skipped |
| Stage mapping coverage | 100% | Block until admin maps all stages |
| Duplicate emails | < 30% | Warn (high duplicate rate suggests dirty data) |

### 9.3 Post-Migration Verification

After loading to production:

```typescript
async function verifyMigration(jobId: string, orgId: string) {
  const supabase = createServiceClient();

  // Count reconciliation
  const stagingCounts = await getStagingCounts(jobId);
  const productionCounts = await getProductionCounts(jobId, orgId);

  const checks = [
    {
      name: 'Candidate count',
      expected: stagingCounts.candidates.valid,
      actual: productionCounts.candidates,
      pass: stagingCounts.candidates.valid === productionCounts.candidates,
    },
    {
      name: 'Application count',
      expected: stagingCounts.applications.valid,
      actual: productionCounts.applications,
      pass: stagingCounts.applications.valid === productionCounts.applications,
    },
    {
      name: 'Job count',
      expected: stagingCounts.jobs.valid,
      actual: productionCounts.jobs,
      pass: stagingCounts.jobs.valid === productionCounts.jobs,
    },
  ];

  // Referential integrity spot check
  const orphanApps = await supabase
    .from('applications')
    .select('id', { count: 'exact' })
    .eq('organization_id', orgId)
    .contains('metadata', { migration_job_id: jobId })
    .is('candidate_id', null);

  checks.push({
    name: 'No orphan applications',
    expected: 0,
    actual: orphanApps.count ?? 0,
    pass: (orphanApps.count ?? 0) === 0,
  });

  return checks;
}
```

---

## 10. Migration Limits (by Plan)

Extends D19 §5.4 with processing constraints:

| Plan | Candidates | Jobs | Applications | Concurrent Migrations | File Storage |
|------|-----------|------|-------------|----------------------|-------------|
| Starter | 500 | 10 | 2,000 | 1 | 500MB |
| Growth | 5,000 | 50 | 20,000 | 1 | 2GB |
| Pro | 25,000 | 200 | 100,000 | 1 | 10GB |
| Enterprise | Unlimited | Unlimited | Unlimited | 3 | Unlimited |

Processing rate: ~100 records/second (batch insert). A 25,000-candidate migration with files takes approximately 15–30 minutes.

---

## 11. CSV Import Enhancements

Extends D19 §4 with advanced import capabilities:

### 11.1 Additional CSV Formats

| Entity | Required | Optional | Max Rows |
|--------|----------|----------|----------|
| Interviews | `candidate_email`, `job_title`, `scheduled_at` | `interviewer_email`, `duration_min`, `location`, `status` | 5,000 |
| Notes | `candidate_email`, `content` | `created_at`, `author_email`, `visibility` | 10,000 |

### 11.2 Template Downloads

Provide downloadable CSV templates for each entity type at `/api/v1/import/templates/:entity`. Templates include:
- Header row with all supported columns
- 3 example rows with valid data
- Comments row explaining column formats

### 11.3 Column Auto-Detection

When CSV headers don't match expected column names, apply fuzzy matching:

| User Header | Matched To | Confidence |
|-------------|-----------|-----------|
| `Name`, `Full Name`, `Candidate Name` | `full_name` | High |
| `Email`, `E-mail`, `Email Address` | `email` | High |
| `Phone`, `Phone Number`, `Mobile` | `phone` | High |
| `Title`, `Job Title`, `Position` | `current_title` | Medium |
| `Company`, `Current Company`, `Employer` | `current_company` | Medium |

Low-confidence matches are shown in the preview step for admin confirmation.

---

## 12. Migration Testing Strategy

### 12.1 Test Data Sets

| Set | Purpose | Records |
|-----|---------|---------|
| `migration-minimal` | Happy path, all fields valid | 10 candidates, 5 jobs, 20 applications |
| `migration-dedup` | Duplicate handling | 50 candidates (20 duplicates) |
| `migration-errors` | Error handling | 30 candidates (10 invalid emails, 5 missing names) |
| `migration-large` | Performance + limits | 10,000 candidates, 500 jobs, 30,000 applications |
| `migration-competitor-*` | Competitor-specific quirks | Per-competitor fixture data |

### 12.2 Integration Tests

```typescript
describe('Migration Pipeline', () => {
  it('should extract, validate, and load candidates', async () => {
    const job = await createMigrationJob({ source: 'greenhouse', fixture: 'minimal' });
    await runMigration(job.id);
    expect(job.status).toBe('completed');
    expect(await countCandidates(job.org_id)).toBe(10);
  });

  it('should handle duplicates gracefully', async () => {
    // Pre-seed 5 candidates with known emails
    const job = await createMigrationJob({ source: 'lever', fixture: 'dedup' });
    await runMigration(job.id);
    expect(job.summary.candidates.duplicate).toBe(20);
    expect(job.summary.candidates.loaded).toBe(30);
  });

  it('should abort on high error rate', async () => {
    const job = await createMigrationJob({ source: 'csv', fixture: 'errors' });
    await runMigration(job.id);
    expect(job.status).toBe('failed');
    expect(job.summary.candidates.invalid).toBeGreaterThan(job.summary.candidates.valid * 0.3);
  });

  it('should rollback all migrated data', async () => {
    const job = await createMigrationJob({ source: 'ashby', fixture: 'minimal' });
    await runMigration(job.id);
    await rollbackMigration(job.id, job.org_id);
    expect(await countCandidates(job.org_id)).toBe(0); // All soft-deleted
  });

  it('should respect plan limits', async () => {
    setOrgPlan('starter');
    const job = await createMigrationJob({ source: 'workable', fixture: 'large' });
    await runMigration(job.id);
    expect(job.summary.candidates.loaded).toBeLessThanOrEqual(500);
  });
});
```

---

## 13. Inngest Functions

Extends D19 §8 with additional migration-specific functions:

| Function ID | Trigger | Purpose |
|-------------|---------|---------|
| `migration/extract` | `migration/started` | Pull data from Merge.dev into staging tables |
| `migration/transform` | `migration/extracted` | Apply field mapping + competitor-specific transforms |
| `migration/validate` | `migration/transformed` | Run Zod validation, dedup, referential integrity |
| `migration/load` | `migration/validated` | Batch insert into production tables |
| `migration/verify` | `migration/loaded` | Count reconciliation + integrity checks |
| `migration/rollback` | `migration/rollback-requested` | Soft-delete all migrated records |
| `migration/file-download` | `migration/file-queued` | Download and re-upload individual attachment |

All functions use `retries: 3` with Inngest's default exponential backoff.

---

## 14. Security Considerations

- **Merge.dev tokens:** Stored encrypted in `migration_jobs.merge_account_token`. Revoked via Merge.dev API after migration completes or is abandoned.
- **Staging table access:** No RLS on staging tables — they are internal (service role only). Never exposed via API.
- **Source data retention:** `source_data` JSONB in staging tables may contain PII from the source system. Purged with staging cleanup (30 days post-completion).
- **File downloads:** Merge.dev attachment URLs are temporary. Downloaded files are re-uploaded to our Storage with proper bucket policies.
- **Migration metadata tagging:** `migration_job_id` in `metadata` is not PII and is safe for audit/rollback purposes.
- **Rate limiting:** One active migration per org prevents resource exhaustion. Merge.dev API rate limits are respected via Inngest retry/backoff.

---

*Created: 2026-03-11*
