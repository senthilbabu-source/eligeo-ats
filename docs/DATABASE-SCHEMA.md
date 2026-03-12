# Complete Database Schema

> **ID:** D01
> **Status:** Review
> **Priority:** P0
> **Last updated:** 2026-03-12
> **Depends on:** S3, ADR-001→010
> **Depended on by:** D02, D03, D06, D07, D08, D09, D10, D11, D12, D13, D16, D17, D19
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** STACK-1, STACK-4, STACK-6, ADR-001→010

---

## Design Principles

These are enforced by ADRs. Violating any of them requires a new ADR.

| Principle | Source | Rule |
|-----------|--------|------|
| Supabase client everywhere, no Prisma | ADR-001 | All queries go through RLS. Background jobs use service role + `SET LOCAL`. |
| UUID v4 primary keys | STACK-4 | `gen_random_uuid()` default on every PK. No CUID, SERIAL, or ULID. |
| Shared schema + RLS | STACK-6 | `organization_id` on every tenant-scoped table. RLS enforced. |
| Soft delete on all tables | ADR-006 | `deleted_at TIMESTAMPTZ DEFAULT NULL`. Exceptions: `audit_logs`, `gdpr_erasure_log` (append-only), `candidate_encryption_keys` (hard-deleted on erasure). |
| Trigger-based audit logging | ADR-007 | `audit_trigger_func()` on every table except `audit_logs`. |
| HNSW vector indexes | ADR-003 | No IVFFlat. `USING hnsw ... WITH (m = 16, ef_construction = 64)`. |
| CHECK for system enums, lookup tables for tenant values | ADR-008 | No PostgreSQL ENUM types. |
| Centralized file metadata | ADR-009 | `files` table + Supabase Storage. No inline URL-only columns. |
| GDPR crypto-shredding | ADR-010 | Per-candidate encryption keys. `erase_candidate()` function. |
| `TIMESTAMPTZ` everywhere | Convention | All timestamp columns use `TIMESTAMPTZ` (UTC storage). |
| Explicit `ON DELETE` on every FK | AI-RULES §5, rule 27 | No implicit CASCADE/RESTRICT. |
| All 4 RLS operations per table | AI-RULES §5, rule 26 | SELECT, INSERT, UPDATE, DELETE policies on every table. |
| `deleted_at IS NULL` in SELECT policies | ADR-006 | Soft-deleted records invisible to normal queries. |

---

## Table Inventory

43 tables across 8 clusters. Sub-documents contain full DDL, RLS, indexes, and triggers.
<!-- +1: org_daily_briefings added in Migration 021 (Wave 3 dashboard briefing cache) -->
<!-- +1: ai_score_feedback added in Migration 022 (AI-Proof Wave A) + embedding_updated_at column on job_openings -->
<!-- +3: offer_templates, offers, offer_approvals added in Migration 028 (Phase 4 Wave 1) + organizations.default_currency column -->

### Cluster 1: Core Tenancy ([schema/01-core-tenancy.md](schema/01-core-tenancy.md))

| Table | Purpose | Volume (1yr/3yr per tenant) | Volume (total at 500 tenants) |
|-------|---------|----------------------------|-------------------------------|
| `organizations` | Tenant records | 1 / 1 | 500 / 1,500 |
| `user_profiles` | Auth-linked user data | 20 / 50 | 10K / 25K |
| `organization_members` | User↔Org membership + roles | 20 / 50 | 10K / 25K |

### Cluster 2: Jobs & Pipeline ([schema/02-jobs-pipeline.md](schema/02-jobs-pipeline.md))

| Table | Purpose | Volume (1yr/3yr per tenant) | Volume (total at 500 tenants) |
|-------|---------|----------------------------|-------------------------------|
| `pipeline_templates` | Reusable hiring pipelines | 5 / 15 | 2.5K / 7.5K |
| `pipeline_stages` | Ordered stages per pipeline | 40 / 120 | 20K / 60K |
| `job_openings` | Active and archived positions | 50 / 200 | 25K / 100K |

### Cluster 3: Candidates & CRM ([schema/03-candidates-crm.md](schema/03-candidates-crm.md))

| Table | Purpose | Volume (1yr/3yr per tenant) | Volume (total at 500 tenants) |
|-------|---------|----------------------------|-------------------------------|
| `candidates` | All candidate profiles | 500 / 2,000 | 250K / 1M |
| `applications` | Candidate↔Job linkage | 1,000 / 5,000 | 500K / 2.5M |
| `application_stage_history` | Pipeline movement audit trail | 5,000 / 25,000 | 2.5M / 12.5M |
| `talent_pools` | Named lists for CRM/nurture | 10 / 30 | 5K / 15K |
| `talent_pool_members` | Candidate↔Pool membership | 200 / 1,000 | 100K / 500K |
| `candidate_sources` | Lookup: attribution sources | 20 / 30 | 10K / 15K |
| `rejection_reasons` | Lookup: rejection categories | 10 / 15 | 5K / 7.5K |

### Cluster 4: Skills & Matching ([schema/04-skills-matching.md](schema/04-skills-matching.md))

| Table | Purpose | Volume (1yr/3yr per tenant) | Volume (total at 500 tenants) |
|-------|---------|----------------------------|-------------------------------|
| `skills` | Canonical skill taxonomy | 200 / 500 | 100K / 250K |
| `candidate_skills` | Candidate↔Skill junction | 2,500 / 10,000 | 1.25M / 5M |
| `job_required_skills` | Job↔Skill requirements | 250 / 1,000 | 125K / 500K |
| `ai_score_feedback` | Recruiter thumbs-up/down on AI match scores (Migration 022) | 1,000 / 5,000 | 500K / 2.5M |

**Column addition — `job_openings.embedding_updated_at TIMESTAMPTZ`** (Migration 022): Tracks when `job_embedding` was last regenerated. NULL = never re-embedded since initial generation. When `job_required_skills` changes or JD is updated, Inngest sets this stale → triggers background re-embed. Enables "Scores may be outdated" nudge on match panel (story AF2).

### Cluster 5: Interviews & Scorecards ([schema/05-interviews-scorecards.md](schema/05-interviews-scorecards.md))

| Table | Purpose | Volume (1yr/3yr per tenant) | Volume (total at 500 tenants) |
|-------|---------|----------------------------|-------------------------------|
| `interviews` | Scheduled interviews | 2,000 / 10,000 | 1M / 5M |
| `scorecard_templates` | Structured evaluation forms | 10 / 30 | 5K / 15K |
| `scorecard_categories` | Evaluation categories per template | 40 / 120 | 20K / 60K |
| `scorecard_attributes` | Attributes per category | 200 / 600 | 100K / 300K |
| `scorecard_submissions` | Interviewer evaluations | 4,000 / 20,000 | 2M / 10M |
| `scorecard_ratings` | Per-attribute ratings | 20,000 / 100,000 | 10M / 50M |

### Cluster 6: Offers ([schema/06-offers.md](schema/06-offers.md))

| Table | Purpose | Volume (1yr/3yr per tenant) | Volume (total at 500 tenants) |
|-------|---------|----------------------------|-------------------------------|
| `offer_templates` | Reusable compensation templates | 5 / 15 | 2.5K / 7.5K |
| `offers` | Offer records | 100 / 500 | 50K / 250K |
| `offer_approvals` | Approval chain records | 300 / 1,500 | 150K / 750K |

### Cluster 7: Communications & Files ([schema/07-communications-files.md](schema/07-communications-files.md))

| Table | Purpose | Volume (1yr/3yr per tenant) | Volume (total at 500 tenants) |
|-------|---------|----------------------------|-------------------------------|
| `notes` | Comments on any entity | 5,000 / 25,000 | 2.5M / 12.5M |
| `email_templates` | Org-customizable email templates | 20 / 40 | 10K / 20K |
| `notification_preferences` | Per-user notification settings | 20 / 50 | 10K / 25K |
| `files` | File metadata (Supabase Storage) | 1,000 / 5,000 | 500K / 2.5M |
| `custom_field_definitions` | Org-defined custom fields | 20 / 50 | 10K / 25K |
| `custom_field_values` | Custom field data | 5,000 / 25,000 | 2.5M / 12.5M |

### Cluster 8: System, Compliance & Integrations ([schema/08-system-compliance.md](schema/08-system-compliance.md))

| Table | Purpose | Volume (1yr/3yr per tenant) | Volume (total at 500 tenants) |
|-------|---------|----------------------------|-------------------------------|
| `audit_logs` | Immutable mutation log | 50,000 / 250,000 | 25M / 125M |
| `ai_usage_logs` | AI credit consumption tracking | 2,000 / 10,000 | 1M / 5M |
| `org_daily_briefings` | Cached AI daily briefing per org per day (Migration 021) | 365 / 1,095 | 182K / 547K |
| `api_keys` | External API access tokens | 3 / 10 | 1.5K / 5K |
| `webhook_endpoints` | Outbound webhook subscriptions | 5 / 15 | 2.5K / 7.5K |
| `nylas_grants` | Calendar integration grants | 10 / 25 | 5K / 12.5K |
| `candidate_dei_data` | DEI demographic data (restricted) | 500 / 2,000 | 250K / 1M |
| `candidate_encryption_keys` | Per-candidate GDPR crypto keys | 500 / 2,000 | 250K / 1M |
| `gdpr_erasure_log` | Erasure compliance records | 10 / 50 | 5K / 25K |

### Partitioning Strategy (rule 84)

Tables exceeding 1M rows at 3-year scale:

| Table | 3yr total | Strategy |
|-------|-----------|----------|
| `audit_logs` | 125M | Partition by `RANGE (performed_at)` monthly. Drop partitions past retention. |
| `scorecard_ratings` | 50M | No partition — rows are small (5 columns), indexed by submission_id. Sequential scan unlikely. |
| `application_stage_history` | 12.5M | Partition by `RANGE (transitioned_at)` quarterly. Historical data rarely queried by date range. |
| `candidates` | 1M | No partition — most queries filter by org_id + status. Composite index sufficient. |

All other tables stay below 1M at 3-year scale and do not require partitioning.

---

## Shared Functions ([schema/00-functions.md](schema/00-functions.md))

All database functions, triggers, and extensions are defined in a dedicated sub-document:

- **Extensions:** `uuid-ossp`, `pgcrypto`, `vector`, `pg_trgm`
- **RLS helpers:** `is_org_member()`, `has_org_role()`, `current_user_org_id()`
- **JWT hook:** `custom_access_token_hook()` (updated for ADR-005 multi-org)
- **Triggers:** `set_updated_at()`, `audit_trigger_func()`
- **AI:** `match_candidates_for_job()`
- **GDPR:** `erase_candidate()`

---

## RBAC Matrix

| Permission | owner | admin | recruiter | hiring_mgr | interviewer |
|------------|-------|-------|-----------|------------|-------------|
| Organization settings | Full | Full | — | — | — |
| Billing / plan | Yes | — | — | — | — |
| Invite members | Yes | Yes | — | — | — |
| Create jobs | Yes | Yes | Yes | — | — |
| Publish jobs | Yes | Yes | Yes | — | — |
| Create candidates | Yes | Yes | Yes | — | — |
| View candidates | Yes | Yes | Yes | Assigned | Assigned |
| Move pipeline stage | Yes | Yes | Yes | Yes | — |
| Add notes | Yes | Yes | Yes | Yes | Yes |
| Submit scorecard | Yes | Yes | Yes | Yes | Yes (own) |
| View scorecards | Yes | Yes | Yes | Yes | Own only* |
| Create offers | Yes | Yes | Yes | — | — |
| Approve offers | Yes | Yes | — | Yes | — |
| Delete jobs | Yes | Yes | — | — | — |
| Delete candidates | Yes | Yes | — | — | — |
| DEI reports | Yes | Yes | — | — | — |
| Export data | Yes | Yes | Limited | — | — |
| API keys | Yes | Yes | — | — | — |
| Audit logs | Yes | Yes | — | — | — |

*Blind review: interviewers see other scorecards only after submitting their own.

---

## ER Diagram

```
organizations
  │ 1:N
  ├── organization_members ──── auth.users ──── user_profiles
  │     (role, last_active_org_id)
  │
  ├── pipeline_templates
  │     └── pipeline_stages (ordered by position)
  │
  ├── job_openings
  │     ├── job_required_skills ──── skills
  │     └── applications ──── candidates
  │           │                  ├── candidate_skills ──── skills
  │           │                  ├── talent_pool_members ──── talent_pools
  │           │                  ├── candidate_dei_data
  │           │                  └── candidate_encryption_keys
  │           │
  │           ├── application_stage_history
  │           ├── interviews
  │           │     └── scorecard_submissions
  │           │           └── scorecard_ratings
  │           ├── offers
  │           │     └── offer_approvals
  │           └── notes
  │
  ├── scorecard_templates
  │     └── scorecard_categories
  │           └── scorecard_attributes
  │
  ├── offer_templates
  ├── email_templates
  ├── custom_field_definitions ──── custom_field_values
  ├── files (entity_type + entity_id polymorphic)
  ├── notification_preferences
  │
  ├── candidate_sources (lookup)
  ├── rejection_reasons (lookup)
  │
  ├── api_keys
  ├── webhook_endpoints
  ├── nylas_grants
  ├── ai_usage_logs
  ├── audit_logs (partitioned, append-only)
  └── gdpr_erasure_log (append-only)
```

---

## JSONB TypeScript Interfaces

All JSONB columns must have TypeScript interfaces per AI-RULES rule 28. These are the ground-truth definitions.

```typescript
// organizations.branding_config
interface BrandingConfig {
  logo_url?: string;
  favicon_url?: string;
  primary_color?: string;    // hex, e.g. "#3B82F6"
  secondary_color?: string;
  font_family?: string;
  career_page_header_html?: string;
}

// organizations.feature_flags
interface FeatureFlags {
  ai_matching?: boolean;
  ai_resume_parsing?: boolean;
  ai_scorecard_summarize?: boolean;
  bulk_import?: boolean;
  api_access?: boolean;
  custom_fields?: boolean;
  white_label?: boolean;
  advanced_analytics?: boolean;
  nurture_sequences?: boolean;
  webhook_outbound?: boolean;
  sso_saml?: boolean;
}

// user_profiles.preferences
interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  email_digest?: 'realtime' | 'daily' | 'weekly' | 'none';
  default_view?: 'kanban' | 'table' | 'list';
  sidebar_collapsed?: boolean;
}

// organization_members.custom_permissions
interface CustomPermissions {
  [permission: string]: boolean;  // Override RBAC matrix for specific permissions
}

// job_openings.metadata (generic JSONB — location, salary use scalar columns)
interface JobMetadata {
  external_ids?: {
    linkedin_id?: string;
    indeed_id?: string;
    merge_job_id?: string;
    [provider: string]: string | undefined;
  };
  application_form_id?: string;
  internal_notes?: string;
  [key: string]: unknown;
}

// candidates.location
interface CandidateLocation {
  city?: string;
  state?: string;
  country?: string;
}

// candidates.resume_parsed
interface ResumeParsed {
  personalInfo: {
    name: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
  };
  summary?: string;
  totalExperienceYears: number;
  skills: string[];
  experience: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate?: string;
    isCurrent: boolean;
    description: string;
    skills: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field?: string;
    year?: string;
  }>;
  certifications: string[];
}

// candidates.source_details
interface SourceDetails {
  referrer_id?: string;
  referrer_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  agency_id?: string;
  agency_name?: string;
}

// pipeline_stages.auto_actions (matches DDL column name)
interface AutoAction {
  type: 'send_email' | 'create_task' | 'notify_team' | 'move_stage' | 'require_scorecard' | 'require_feedback' | 'require_approval';
  template?: string;
  delay_hours?: number;
  conditions?: Record<string, unknown>;
}
type AutoActions = AutoAction[];

// offers.compensation
interface OfferCompensation {
  base_salary: number;
  currency: string;
  period: 'annual' | 'monthly' | 'hourly';
  bonus_pct?: number;
  bonus_amount?: number;
  equity_shares?: number;
  equity_type?: 'options' | 'rsu' | 'phantom';
  equity_vesting?: string;
  sign_on_bonus?: number;
  relocation?: number;
  other_benefits?: string[];
}

// custom_field_values.value
type CustomFieldValue = string | number | boolean | string[] | null;

// candidate_dei_data.data
interface DeiData {
  gender?: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';
  ethnicity?: string;
  veteran_status?: 'veteran' | 'non_veteran' | 'prefer_not_to_say';
  disability_status?: 'yes' | 'no' | 'prefer_not_to_say';
}
```

---

## Supabase Realtime Publications

Tables with Realtime subscriptions (tenant-scoped channels per ADR-001):

```sql
-- Enable Realtime for interactive tables
ALTER PUBLICATION supabase_realtime ADD TABLE applications;
ALTER PUBLICATION supabase_realtime ADD TABLE notes;
ALTER PUBLICATION supabase_realtime ADD TABLE interviews;
ALTER PUBLICATION supabase_realtime ADD TABLE scorecard_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE offers;
ALTER PUBLICATION supabase_realtime ADD TABLE notification_preferences;
```

Channel naming: `org:{organization_id}:{table_name}` — RLS automatically scopes Realtime to the authenticated user's tenant.

---

## Migration Ordering

40 tables grouped into migration batches following FK dependency order. No circular dependencies exist.

**Run before any tables:** Extensions (`uuid-ossp`, `pgcrypto`, `vector`, `pg_trgm`) and helper functions (`set_updated_at()`, `is_org_member()`, `has_org_role()`, `current_user_org_id()`, `custom_access_token_hook()`, `audit_trigger_func()`). See [00-functions.md](schema/00-functions.md).

| Batch | Tables | Depends On | Notes |
|-------|--------|-----------|-------|
| 1 | `organizations` | — | Anchor table. Every tenant-scoped table FKs here. |
| 2 | `user_profiles` | `auth.users` (external) | Auth bridge. No dep on `organizations`. |
| 3 | `organization_members` | `organizations`, `auth.users` | Self-ref `last_active_org_id` → `organizations`. |
| 4 | `candidate_sources`, `rejection_reasons` | `organizations` | Lookup tables. Seed defaults after creation. |
| 5 | `pipeline_templates` | `organizations` | — |
| 6 | `pipeline_stages` | `organizations`, `pipeline_templates` | Ordered stages within templates. |
| 7 | `job_openings` | `organizations`, `pipeline_templates` | — |
| 8 | `candidates` | `organizations`, `candidate_sources` | — |
| 9 | `skills` | `organizations` (optional) | Self-ref `parent_id`. Global skills have NULL `org_id`. |
| 10 | `job_required_skills`, `candidate_skills` | `organizations`, `job_openings`/`candidates`, `skills` | Junction tables. |
| 11 | `applications` | `organizations`, `candidates`, `job_openings`, `pipeline_stages`, `rejection_reasons`, `auth.users` | Central entity linking candidates to jobs. |
| 12 | `application_stage_history` | `organizations`, `applications`, `pipeline_stages`, `auth.users` | Audit trail for stage moves. |
| 13 | `talent_pools`, `talent_pool_members` | `organizations`, `candidates`, `auth.users` | Pool members FK both pools and candidates. |
| 14 | `scorecard_templates` | `organizations`, `auth.users` | — |
| 15 | `scorecard_categories` | `organizations`, `scorecard_templates` | — |
| 16 | `scorecard_attributes` | `organizations`, `scorecard_categories` | — |
| 17 | `interviews` | `organizations`, `applications`, `job_openings`, `auth.users`, `scorecard_templates` | — |
| 18 | `scorecard_submissions` | `organizations`, `interviews`, `applications`, `auth.users` | — |
| 19 | `scorecard_ratings` | `organizations`, `scorecard_submissions`, `scorecard_attributes` | — |
| 20 | `offer_templates` | `organizations`, `auth.users` | — |
| 21 | `offers` | `organizations`, `applications`, `candidates`, `job_openings`, `offer_templates`, `auth.users` | — |
| 22 | `offer_approvals` | `organizations`, `offers`, `auth.users` | — |
| 23 | `notes` | `organizations`, `auth.users`, `candidates` | Self-ref `parent_id` for threading. |
| 24 | `email_templates`, `notification_preferences` | `organizations`, `auth.users` | — |
| 25 | `files` | `organizations`, `auth.users` | Polymorphic `entity_type`/`entity_id` (no FK). |
| 26 | `custom_field_definitions`, `custom_field_values` | `organizations`, `auth.users` | Polymorphic `entity_type`/`entity_id` (no FK). |
| 27 | `ai_usage_logs`, `api_keys`, `webhook_endpoints`, `nylas_grants` | `organizations`, `auth.users` | System/integration tables. |
| 28 | `candidate_dei_data`, `candidate_encryption_keys` | `organizations`, `candidates` | — |
| 29 | `audit_logs`, `gdpr_erasure_log` | — (no FKs) | Append-only. Created last. Triggers attached after all tables exist. |

**Self-referential columns (not circular):** `organization_members.last_active_org_id`, `skills.parent_id`, `notes.parent_id`. All reference their own table.

**Seed data after batch 4:** Default `candidate_sources` (Referral, LinkedIn, Career Page, Job Board, Agency, Direct) and `rejection_reasons` (Not qualified, Position filled, Candidate withdrew, Failed assessment, Compensation mismatch, Culture fit, Other).

**Realtime publication (after all tables):** `applications`, `notes`, `interviews`, `scorecard_submissions`, `offers`, `notification_preferences`.

**Audit triggers (after all tables):** Attach `audit_trigger_func()` to every table except `audit_logs`, `gdpr_erasure_log`, and `candidate_encryption_keys`.

---

## Sub-Documents

| Document | Tables | Lines |
|----------|--------|-------|
| [00-functions.md](schema/00-functions.md) | Extensions, functions, triggers | ~200 |
| [01-core-tenancy.md](schema/01-core-tenancy.md) | organizations, user_profiles, organization_members | ~250 |
| [02-jobs-pipeline.md](schema/02-jobs-pipeline.md) | pipeline_templates, pipeline_stages, job_openings | ~250 |
| [03-candidates-crm.md](schema/03-candidates-crm.md) | candidates, applications, stage_history, talent_pools, sources, rejection_reasons | ~400 |
| [04-skills-matching.md](schema/04-skills-matching.md) | skills, candidate_skills, job_required_skills | ~200 |
| [05-interviews-scorecards.md](schema/05-interviews-scorecards.md) | interviews, scorecard_* (5 tables) | ~350 |
| [06-offers.md](schema/06-offers.md) | offer_templates, offers, offer_approvals | ~250 |
| [07-communications-files.md](schema/07-communications-files.md) | notes, email_templates, notification_preferences, files, custom_fields | ~400 |
| [08-system-compliance.md](schema/08-system-compliance.md) | audit_logs, ai_usage_logs, org_daily_briefings, api_keys, webhooks, nylas_grants, DEI, GDPR | ~450 |

---

*Created: 2026-03-10*
