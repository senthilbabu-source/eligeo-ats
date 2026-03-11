# Data Migration & Onboarding

> **ID:** D19
> **Status:** Review
> **Priority:** P3
> **Last updated:** 2026-03-10
> **Depends on:** D01 (schema — all tables), D02 (API — bulk endpoints), D09 (Candidate Portal — career page setup)
> **Depended on by:** — (terminal document)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-006 (soft delete), ADR-009 (file storage)

---

## 1. Overview

Data Migration & Onboarding defines how new organizations get started with the ATS: the signup flow, onboarding wizard, CSV bulk import, ATS-to-ATS migration, and demo data seeding. The goal is time-to-first-value under 10 minutes for self-serve and under 1 hour for migrating organizations.

**Scope:**
- In scope: Signup flow, onboarding wizard, CSV import (candidates, jobs), ATS-to-ATS migration via Merge.dev, demo data seeding, data validation, import error handling.
- Out of scope: Billing setup (D03), career page theming (D09), user training content.

## 2. Signup Flow

### 2.1 Steps

```
1. Email + password → Supabase Auth signup
2. Create organization (name, slug)
3. Create organization_member (role: 'owner')
4. Set plan = 'starter', subscription_status = 'trialing' (14-day trial, then $29/mo)
5. JWT refresh → org_id injected into claims
6. Redirect to onboarding wizard
```

### 2.2 Organization Slug

Auto-generated from org name (`"Acme Corp"` → `"acme-corp"`). Editable during signup. Validated against `CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')` and uniqueness.

## 3. Onboarding Wizard

### 3.1 Steps

| Step | Required | What It Does |
|------|----------|-------------|
| 1. Company profile | ✅ | Name, logo upload, timezone selection |
| 2. Invite team | ❌ | Email invitations for recruiters/hiring managers |
| 3. Create first pipeline | ✅ | Choose template (default provided) or build custom |
| 4. Post first job | ❌ | Quick job creation form (title, department, location) |
| 5. Import candidates | ❌ | CSV upload or skip |

### 3.2 Default Pipeline Template

Created automatically on org setup:

| Stage | Type | Order | Auto-Actions |
|-------|------|-------|-------------|
| Applied | `applied` | 1 | Send confirmation email |
| Screening | `screening` | 2 | Notify recruiter |
| Phone Screen | `interview` | 3 | — |
| On-site Interview | `interview` | 4 | — |
| Offer | `offer` | 5 | — |
| Hired | `hired` | 6 | Add to "Alumni" pool |
| Rejected | `rejected` | 7 | — |

### 3.3 Skip & Resume

Wizard state is stored in `organizations.metadata.onboarding`:

```typescript
interface OnboardingState {
  completed_steps: number[];
  current_step: number;
  completed_at?: string; // ISO 8601 — set when all required steps done
}
```

Users can skip optional steps and return later. The wizard banner appears on the dashboard until `completed_at` is set.

## 4. CSV Import

### 4.1 Supported Imports

| Entity | Required Columns | Optional Columns | Max Rows |
|--------|-----------------|------------------|----------|
| Candidates | `full_name`, `email` | `phone`, `current_title`, `current_company`, `location`, `linkedin_url`, `skills` (semicolon-separated), `tags`, `source` | 10,000 |
| Jobs | `title`, `department` | `location`, `location_type`, `employment_type`, `description`, `salary_min`, `salary_max`, `status` | 1,000 |

### 4.2 Import Flow

```
1. User uploads CSV file (max 5MB)
2. Server parses CSV, validates headers against expected columns
3. Preview: show first 10 rows with validation status (valid/error per row)
4. User confirms import
5. Inngest function processes rows in batches of 100
   a. Validate each row (Zod schema)
   b. Dedup candidates by (organization_id, email)
   c. Insert valid rows, collect errors
   d. Generate import report
6. User sees import results (X imported, Y skipped, Z errors)
```

### 4.3 Import Processing

```typescript
export const onboardingCsvImport = inngest.createFunction(
  { id: 'onboarding-csv-import', retries: 2 },
  { event: 'onboarding/csv-import' },
  async ({ event, step }) => {
    const { organization_id, file_path, entity_type, imported_by } = event.data;
    const supabase = createServiceClient();

    // Parse CSV
    const rows = await step.run('parse-csv', async () => {
      const file = await supabaseAdmin.storage.from('imports').download(file_path);
      return parseCSV(await file.data.text());
    });

    // Process in batches
    const batchSize = 100;
    const results = { imported: 0, skipped: 0, errors: [] as ImportError[] };

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      await step.run(`batch-${i}`, async () => {
        for (const row of batch) {
          try {
            const validated = candidateImportSchema.parse(row);

            // Dedup check
            const { data: existing } = await supabase
              .from('candidates')
              .select('id')
              .eq('organization_id', organization_id)
              .eq('email', validated.email)
              .is('deleted_at', null)
              .maybeSingle();

            if (existing) {
              results.skipped++;
              continue;
            }

            await supabase.from('candidates').insert({
              organization_id,
              full_name: validated.full_name,
              email: validated.email,
              phone: validated.phone ?? null,
              current_title: validated.current_title ?? null,
              current_company: validated.current_company ?? null,
              location: validated.location ?? null,
              linkedin_url: validated.linkedin_url ?? null,
              skills: validated.skills?.split(';').map((s: string) => s.trim()) ?? [],
              tags: validated.tags?.split(';').map((t: string) => t.trim()) ?? [],
              source: validated.source ?? 'csv_import',
            });

            results.imported++;
          } catch (error) {
            results.errors.push({
              row: i + batch.indexOf(row) + 2, // +2 for header + 0-index
              error: error.message,
              data: row,
            });
          }
        }
      });
    }

    // Trigger Typesense sync for imported candidates
    await step.run('sync-search', async () => {
      await inngest.send({
        name: 'search/bulk-sync',
        data: { organization_id, entity_type: 'candidates' },
      });
    });

    return results;
  }
);
```

### 4.4 Validation Rules

```typescript
const candidateImportSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional(),
  current_title: z.string().max(200).optional(),
  current_company: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  skills: z.string().optional(), // Semicolon-separated
  tags: z.string().optional(),   // Semicolon-separated
  source: z.string().max(100).optional(),
});
```

## 5. ATS-to-ATS Migration (Merge.dev)

### 5.1 Supported Source Systems

Via Merge.dev ATS integration:
- Greenhouse, Lever, Ashby, Workable, BambooHR, JazzHR, Recruitee, and 30+ others.

### 5.2 Migration Flow

```
1. Admin connects source ATS via Merge.dev OAuth
2. Merge.dev syncs data into normalized schema
3. Inngest function maps Merge.dev objects to ATS tables:
   - Merge Candidate → candidates
   - Merge Application → applications
   - Merge Job → job_openings
   - Merge Interview → interviews
   - Merge Offer → offers
4. Stage mapping: admin maps source pipeline stages to ATS stages
5. Import executes in background (Inngest)
6. Completion report sent to admin
```

### 5.3 Stage Mapping UI

Source system stages don't match target pipeline. Admin maps them:

```typescript
interface StageMappingConfig {
  source_stages: { id: string; name: string }[];
  mappings: Record<string, string>; // source_stage_id → target_pipeline_stage_id
  unmapped_action: 'skip' | 'create_stage'; // What to do with unmapped stages
}
```

### 5.4 Migration Limits

| Plan | Candidate Limit | Job Limit | Historical Data |
|------|----------------|-----------|-----------------|
| Starter | 500 | 10 | Last 6 months |
| Growth | 5,000 | 50 | Last 12 months |
| Pro | 25,000 | 200 | Last 24 months |
| Enterprise | Unlimited | Unlimited | Full history |

## 6. Demo Data

### 6.1 Demo Seeding

For trial organizations, a "Load demo data" button populates:

| Entity | Count | Content |
|--------|-------|---------|
| Candidates | 50 | Realistic fake names/emails (Faker.js) |
| Job Openings | 5 | Common tech roles (Engineer, Designer, PM, etc.) |
| Applications | 100 | Distributed across jobs and stages |
| Pipeline | 1 | Default template with demo stages |
| Interviews | 20 | Mix of scheduled/completed |
| Notes | 30 | Sample feedback notes |

### 6.2 Demo Cleanup

```typescript
// Flag demo data for easy cleanup
// All demo records: metadata.is_demo = true

async function clearDemoData(orgId: string) {
  const supabase = createServiceClient();
  const tables = ['notes', 'interviews', 'applications', 'candidates', 'job_openings'];

  for (const table of tables) {
    await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .contains('metadata', { is_demo: true });
  }
}
```

## 7. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/onboarding/setup` | JWT (owner) | Create org + default pipeline |
| PUT | `/api/v1/onboarding/wizard` | JWT (owner) | Update wizard step progress |
| POST | `/api/v1/import/csv` | JWT (admin) | Upload CSV for import |
| GET | `/api/v1/import/:id/status` | JWT (admin) | Get import job status |
| POST | `/api/v1/import/merge` | JWT (admin) | Start Merge.dev migration |
| POST | `/api/v1/import/merge/stage-mapping` | JWT (admin) | Save stage mappings |
| POST | `/api/v1/onboarding/demo-data` | JWT (owner) | Seed demo data |
| DELETE | `/api/v1/onboarding/demo-data` | JWT (owner) | Clear demo data |

## 8. Inngest Functions

| Function ID | Trigger | Purpose |
|-------------|---------|---------|
| `onboarding-csv-import` | `onboarding/csv-import` | Process CSV rows in batches |
| `onboarding-merge-sync` | `onboarding/merge-sync` | Sync data from Merge.dev |
| `onboarding-demo-seed` | `onboarding/demo-seed` | Generate and insert demo data |

## 9. Security Considerations

- **CSV injection:** All CSV cell values are sanitized — cells starting with `=`, `+`, `-`, `@` are prefixed with a single quote to prevent formula injection in exported files.
- **File validation:** CSV uploads validated by MIME type and file extension. Max 5MB.
- **Merge.dev OAuth:** OAuth tokens stored encrypted. Revoked after migration completes.
- **Demo data isolation:** Demo records carry `metadata.is_demo = true`. Cleanup is soft-delete only.
- **Import rate limiting:** One active import per organization. Prevents resource exhaustion.
