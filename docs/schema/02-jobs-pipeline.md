# D02 — Jobs & Pipeline

> Sub-document of [DATABASE-SCHEMA.md](../DATABASE-SCHEMA.md)
> Tables: `pipeline_templates`, `pipeline_stages`, `job_openings`

---

## `pipeline_templates`

Reusable hiring pipeline templates. Each template defines an ordered sequence of stages that can be cloned into a job opening.

```sql
CREATE TABLE pipeline_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  description     TEXT,
  is_default      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (organization_id, name)
);
```

### Indexes

```sql
-- Org-scoped template listing (settings page, job creation wizard)
CREATE INDEX idx_pipeline_templates_org
  ON pipeline_templates(organization_id)
  WHERE deleted_at IS NULL;

-- Fast lookup for the default template during job creation
CREATE UNIQUE INDEX idx_pipeline_templates_default
  ON pipeline_templates(organization_id)
  WHERE is_default = TRUE AND deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE pipeline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_templates_select" ON pipeline_templates FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "pipeline_templates_insert" ON pipeline_templates FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "pipeline_templates_update" ON pipeline_templates FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "pipeline_templates_delete" ON pipeline_templates FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON pipeline_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON pipeline_templates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `pipeline_stages`

Ordered stages within a pipeline template. Each stage represents a step candidates move through (e.g., "Phone Screen", "Technical Interview").

```sql
CREATE TABLE pipeline_stages (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  pipeline_template_id UUID        NOT NULL REFERENCES pipeline_templates(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  stage_type           TEXT        NOT NULL
                                   CHECK (stage_type IN ('sourced', 'applied', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  stage_order          INTEGER     NOT NULL,
  is_terminal          BOOLEAN     NOT NULL DEFAULT FALSE,
  auto_actions         JSONB       NOT NULL DEFAULT '{}',  -- e.g., auto-send email, schedule interview
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (pipeline_template_id, stage_order)
);
```

### Indexes

```sql
-- Ordered stage listing for a template (pipeline editor, candidate board)
CREATE INDEX idx_pipeline_stages_template
  ON pipeline_stages(pipeline_template_id, stage_order)
  WHERE deleted_at IS NULL;

-- Org-scoped lookup for RLS and cross-template queries
CREATE INDEX idx_pipeline_stages_org
  ON pipeline_stages(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages FORCE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_stages_select" ON pipeline_stages FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "pipeline_stages_insert" ON pipeline_stages FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "pipeline_stages_update" ON pipeline_stages FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "pipeline_stages_delete" ON pipeline_stages FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `job_openings`

Active job requisitions. Each job is linked to a pipeline template and carries an AI embedding for semantic candidate matching.

```sql
CREATE TABLE job_openings (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  pipeline_template_id UUID           NOT NULL REFERENCES pipeline_templates(id) ON DELETE RESTRICT,
  title                TEXT           NOT NULL,
  slug                 TEXT           NOT NULL,
  description          TEXT,
  description_html     TEXT,
  department           TEXT,
  location             TEXT,
  location_type        TEXT           NOT NULL DEFAULT 'on_site'
                                      CHECK (location_type IN ('on_site', 'remote', 'hybrid')),
  employment_type      TEXT           NOT NULL DEFAULT 'full_time'
                                      CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship', 'freelance')),
  salary_min           NUMERIC(12,2),
  salary_max           NUMERIC(12,2),
  salary_currency      TEXT           DEFAULT 'USD',
  status               TEXT           NOT NULL DEFAULT 'draft'
                                      CHECK (status IN ('draft', 'open', 'paused', 'closed', 'archived')),
  hiring_manager_id    UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  recruiter_id         UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  headcount            INTEGER        NOT NULL DEFAULT 1,
  published_at         TIMESTAMPTZ,
  closes_at            TIMESTAMPTZ,
  job_embedding        vector(1536),  -- OpenAI text-embedding-3-small, HNSW indexed (ADR-003)
  metadata             JSONB          NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ    DEFAULT NULL,

  UNIQUE (organization_id, slug),
  CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)
);
```

### Indexes

```sql
-- Org-scoped job listing (job board, recruiter dashboard)
CREATE INDEX idx_jobs_org_status
  ON job_openings(organization_id, status)
  WHERE deleted_at IS NULL;

-- Slug lookup for public career page URLs
CREATE UNIQUE INDEX idx_jobs_slug
  ON job_openings(organization_id, slug)
  WHERE deleted_at IS NULL;

-- HNSW vector index for semantic job matching (ADR-003)
CREATE INDEX idx_jobs_embedding
  ON job_openings USING hnsw (job_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Hiring manager's open jobs
CREATE INDEX idx_jobs_hiring_manager
  ON job_openings(hiring_manager_id)
  WHERE deleted_at IS NULL AND status = 'open';

-- Recruiter's assigned jobs
CREATE INDEX idx_jobs_recruiter
  ON job_openings(recruiter_id)
  WHERE deleted_at IS NULL AND status IN ('open', 'paused');
```

### RLS

```sql
ALTER TABLE job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_openings FORCE ROW LEVEL SECURITY;

CREATE POLICY "jobs_select" ON job_openings FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "jobs_insert" ON job_openings FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "jobs_update" ON job_openings FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "jobs_delete" ON job_openings FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON job_openings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON job_openings
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```
