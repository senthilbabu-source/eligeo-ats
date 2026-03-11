-- Migration 009: Candidates
-- Phase 2: Jobs + Career Portal
-- Dependencies: 00002 (organizations), 00006 (candidate_sources)

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
  resume_url           TEXT,
  resume_text          TEXT,
  resume_parsed        JSONB,
  resume_file_hash     TEXT,
  skills               TEXT[]         NOT NULL DEFAULT '{}',
  tags                 TEXT[]         NOT NULL DEFAULT '{}',
  source               TEXT,
  source_id            UUID           REFERENCES candidate_sources(id) ON DELETE SET NULL,
  source_details       JSONB          NOT NULL DEFAULT '{}',
  is_anonymized        BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ    DEFAULT NULL,

  UNIQUE (organization_id, email)
);

-- Note: candidate_embedding vector(1536) column deferred to v2.0

CREATE INDEX idx_candidates_org
  ON candidates(organization_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_candidates_email
  ON candidates(organization_id, email)
  WHERE deleted_at IS NULL;

-- Trigram index for fuzzy name search (pg_trgm)
CREATE INDEX idx_candidates_name_trgm
  ON candidates USING gin (full_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_candidates_source
  ON candidates(organization_id, source_id)
  WHERE deleted_at IS NULL AND source_id IS NOT NULL;

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates FORCE ROW LEVEL SECURITY;

CREATE POLICY "candidates_select" ON candidates FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "candidates_insert" ON candidates FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "candidates_update" ON candidates FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "candidates_delete" ON candidates FOR DELETE
  USING (has_org_role(organization_id, 'owner', 'admin') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_candidates_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_candidates_audit
  AFTER INSERT OR UPDATE OR DELETE ON candidates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
