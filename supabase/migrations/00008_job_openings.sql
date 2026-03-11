-- Migration 008: Job Openings
-- Phase 2: Jobs + Career Portal
-- Dependencies: 00002 (organizations), 00007 (pipeline_templates)

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
  metadata             JSONB          NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ    DEFAULT NULL,

  UNIQUE (organization_id, slug),
  CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)
);

-- Note: job_embedding vector(1536) column deferred to v2.0 (requires vector extension)

CREATE INDEX idx_jobs_org_status
  ON job_openings(organization_id, status)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_jobs_slug
  ON job_openings(organization_id, slug)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_jobs_hiring_manager
  ON job_openings(hiring_manager_id)
  WHERE deleted_at IS NULL AND status = 'open';

CREATE INDEX idx_jobs_recruiter
  ON job_openings(recruiter_id)
  WHERE deleted_at IS NULL AND status IN ('open', 'paused');

ALTER TABLE job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_openings FORCE ROW LEVEL SECURITY;

CREATE POLICY "jobs_select" ON job_openings FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "jobs_insert" ON job_openings FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "jobs_update" ON job_openings FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "jobs_delete" ON job_openings FOR DELETE
  USING (has_org_role(organization_id, 'owner', 'admin') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON job_openings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_jobs_audit
  AFTER INSERT OR UPDATE OR DELETE ON job_openings
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
