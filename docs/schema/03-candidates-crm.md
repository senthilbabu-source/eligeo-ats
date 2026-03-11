# D03 — Candidates & CRM

> Sub-document of [DATABASE-SCHEMA.md](../DATABASE-SCHEMA.md)
> Tables: `candidate_sources`, `rejection_reasons`, `candidates`, `applications`, `application_stage_history`, `talent_pools`, `talent_pool_members`

---

## `candidate_sources`

Lookup table for structured candidate attribution (e.g., "LinkedIn", "Referral", "Career Page"). Org-scoped with system defaults.

```sql
CREATE TABLE candidate_sources (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  is_system       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (organization_id, name)
);
```

### Indexes

```sql
-- Org-scoped source listing (dropdown in candidate forms)
CREATE INDEX idx_candidate_sources_org
  ON candidate_sources(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE candidate_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_sources FORCE ROW LEVEL SECURITY;

CREATE POLICY "candidate_sources_select" ON candidate_sources FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "candidate_sources_insert" ON candidate_sources FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "candidate_sources_update" ON candidate_sources FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "candidate_sources_delete" ON candidate_sources FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
-- No updated_at column, so no set_updated_at trigger

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON candidate_sources
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `rejection_reasons`

Lookup table for standardized rejection reasons. Org-scoped with system defaults.

```sql
CREATE TABLE rejection_reasons (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  is_system       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (organization_id, name)
);
```

### Indexes

```sql
-- Org-scoped reason listing (rejection modal dropdown)
CREATE INDEX idx_rejection_reasons_org
  ON rejection_reasons(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE rejection_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejection_reasons FORCE ROW LEVEL SECURITY;

CREATE POLICY "rejection_reasons_select" ON rejection_reasons FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "rejection_reasons_insert" ON rejection_reasons FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "rejection_reasons_update" ON rejection_reasons FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "rejection_reasons_delete" ON rejection_reasons FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
-- No updated_at column, so no set_updated_at trigger

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON rejection_reasons
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `candidates`

Central candidate record. One row per unique person per organization. Carries AI embedding for semantic matching and denormalized resume fields (files table is authority per ADR-009).

```sql
CREATE TABLE candidates (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  full_name            TEXT           NOT NULL,
  email                TEXT           NOT NULL,
  phone                TEXT,
  current_title        TEXT,
  current_company      TEXT,
  location             TEXT,
  linkedin_url         TEXT,
  github_url           TEXT,
  portfolio_url        TEXT,
  resume_url           TEXT,           -- Denormalized convenience; files table is authority (ADR-009)
  resume_text          TEXT,           -- Extracted plain text for full-text search
  resume_parsed        JSONB,          -- Structured resume parse output
  resume_file_hash     TEXT,           -- Dedup hash for re-upload detection
  skills               TEXT[]         NOT NULL DEFAULT '{}',
  tags                 TEXT[]         NOT NULL DEFAULT '{}',
  source               TEXT,           -- Free-text source for backward compat
  source_id            UUID           REFERENCES candidate_sources(id) ON DELETE SET NULL,  -- Structured attribution FK
  source_details       JSONB          NOT NULL DEFAULT '{}',
  candidate_embedding  vector(1536),  -- OpenAI text-embedding-3-small, HNSW indexed (ADR-003)
  is_anonymized        BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ    DEFAULT NULL,

  UNIQUE (organization_id, email)
);
```

### Indexes

```sql
-- Org-scoped candidate listing (candidate table, search)
CREATE INDEX idx_candidates_org
  ON candidates(organization_id)
  WHERE deleted_at IS NULL;

-- Email lookup for dedup on import/apply
-- Dedup strategy: exact email match within an org is the MVP gate.
-- On import or application, check this index first. If a match exists,
-- merge into the existing candidate record rather than creating a duplicate.
-- Fuzzy matching (name similarity, phone normalization, LinkedIn URL matching)
-- is deferred to post-MVP and will use a candidate merge UI with manual review.
CREATE UNIQUE INDEX idx_candidates_email
  ON candidates(organization_id, email)
  WHERE deleted_at IS NULL;

-- HNSW vector index for semantic candidate matching (ADR-003)
CREATE INDEX idx_candidates_embedding
  ON candidates USING hnsw (candidate_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search on name (typeahead)
CREATE INDEX idx_candidates_name_trgm
  ON candidates USING gin (full_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Source attribution filtering
CREATE INDEX idx_candidates_source
  ON candidates(organization_id, source_id)
  WHERE deleted_at IS NULL AND source_id IS NOT NULL;
```

### RLS

```sql
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates FORCE ROW LEVEL SECURITY;

CREATE POLICY "candidates_select" ON candidates FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "candidates_insert" ON candidates FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "candidates_update" ON candidates FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "candidates_delete" ON candidates FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON candidates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `applications`

Links a candidate to a job opening. Tracks current pipeline stage and disposition status.

```sql
CREATE TABLE applications (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  candidate_id      UUID        NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  job_opening_id    UUID        NOT NULL REFERENCES job_openings(id) ON DELETE RESTRICT,
  current_stage_id  UUID        REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'hired', 'rejected', 'withdrawn')),
  rejection_reason_id UUID      REFERENCES rejection_reasons(id) ON DELETE SET NULL,
  rejection_notes   TEXT,
  applied_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hired_at          TIMESTAMPTZ,
  rejected_at       TIMESTAMPTZ,
  withdrawn_at      TIMESTAMPTZ,
  source            TEXT,
  referrer_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  score             NUMERIC(5,2),  -- Aggregate scorecard score
  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (candidate_id, job_opening_id)
);
```

### Indexes

```sql
-- Job's application list (Kanban board, sorted by stage)
CREATE INDEX idx_applications_job
  ON applications(job_opening_id, current_stage_id)
  WHERE deleted_at IS NULL;

-- Candidate's application history
CREATE INDEX idx_applications_candidate
  ON applications(candidate_id)
  WHERE deleted_at IS NULL;

-- Org-scoped listing for dashboard stats
CREATE INDEX idx_applications_org_status
  ON applications(organization_id, status)
  WHERE deleted_at IS NULL;

-- Referrer lookup for referral tracking
CREATE INDEX idx_applications_referrer
  ON applications(referrer_id)
  WHERE deleted_at IS NULL AND referrer_id IS NOT NULL;
```

### RLS

```sql
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;

CREATE POLICY "applications_select" ON applications FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "applications_insert" ON applications FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "applications_update" ON applications FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "applications_delete" ON applications FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON applications
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `application_stage_history`

Append-only log of stage transitions for an application. Provides full audit trail of candidate movement through the pipeline.

```sql
CREATE TABLE application_stage_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  application_id   UUID        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_stage_id    UUID        REFERENCES pipeline_stages(id) ON DELETE SET NULL,  -- NULL for initial placement
  to_stage_id      UUID        NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  transitioned_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ DEFAULT NULL  -- Present for consistency; not used operationally
);
```

### Indexes

```sql
-- Application's transition timeline (stage history sidebar)
CREATE INDEX idx_stage_history_application
  ON application_stage_history(application_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Org-scoped queries for pipeline analytics
CREATE INDEX idx_stage_history_org
  ON application_stage_history(organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Stage throughput analytics (time-in-stage calculations)
CREATE INDEX idx_stage_history_to_stage
  ON application_stage_history(to_stage_id, created_at)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE application_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_stage_history FORCE ROW LEVEL SECURITY;

CREATE POLICY "stage_history_select" ON application_stage_history FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "stage_history_insert" ON application_stage_history FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
    AND organization_id = current_user_org_id()
  );

-- Append-only: no updates allowed
CREATE POLICY "stage_history_update" ON application_stage_history FOR UPDATE
  USING (FALSE);

-- Append-only: no deletes allowed
CREATE POLICY "stage_history_delete" ON application_stage_history FOR DELETE
  USING (FALSE);
```

### Triggers

```sql
-- No updated_at column, so no set_updated_at trigger

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON application_stage_history
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `talent_pools`

Named collections of candidates for sourcing, nurturing, or pipelining across jobs.

```sql
CREATE TABLE talent_pools (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  description     TEXT,
  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (organization_id, name)
);
```

### Indexes

```sql
-- Org-scoped pool listing (talent pool sidebar)
CREATE INDEX idx_talent_pools_org
  ON talent_pools(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE talent_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_pools FORCE ROW LEVEL SECURITY;

CREATE POLICY "talent_pools_select" ON talent_pools FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "talent_pools_insert" ON talent_pools FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "talent_pools_update" ON talent_pools FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "talent_pools_delete" ON talent_pools FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON talent_pools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON talent_pools
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `talent_pool_members`

Junction table linking candidates to talent pools. A candidate can belong to multiple pools.

```sql
CREATE TABLE talent_pool_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  talent_pool_id  UUID        NOT NULL REFERENCES talent_pools(id) ON DELETE CASCADE,
  candidate_id    UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  added_by        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (talent_pool_id, candidate_id)
);
```

### Indexes

```sql
-- Pool's member listing (talent pool detail page)
CREATE INDEX idx_pool_members_pool
  ON talent_pool_members(talent_pool_id)
  WHERE deleted_at IS NULL;

-- Candidate's pool memberships (candidate profile sidebar)
CREATE INDEX idx_pool_members_candidate
  ON talent_pool_members(candidate_id)
  WHERE deleted_at IS NULL;

-- Org-scoped for RLS and analytics
CREATE INDEX idx_pool_members_org
  ON talent_pool_members(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE talent_pool_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_pool_members FORCE ROW LEVEL SECURITY;

CREATE POLICY "pool_members_select" ON talent_pool_members FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "pool_members_insert" ON talent_pool_members FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "pool_members_update" ON talent_pool_members FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "pool_members_delete" ON talent_pool_members FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
-- No updated_at column, so no set_updated_at trigger

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON talent_pool_members
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```
