-- Migration 032: Conversational AI Screening (Wave P6-4)
-- Dependencies: 00030 (phase6_foundation), 00009 (candidates), 00011 (applications), 00008 (job_openings)
-- Adds: screening_configs + screening_sessions tables

-- ─── screening_configs ──────────────────────────────────────

CREATE TABLE screening_configs (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  job_opening_id   UUID           NOT NULL REFERENCES job_openings(id) ON DELETE RESTRICT,
  questions        JSONB          NOT NULL DEFAULT '[]',
  instructions     TEXT,
  max_duration_min INTEGER        NOT NULL DEFAULT 15,
  is_active        BOOLEAN        NOT NULL DEFAULT TRUE,
  created_by       UUID           NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (organization_id, job_opening_id)
);

CREATE INDEX idx_screening_configs_job ON screening_configs(organization_id, job_opening_id)
  WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE screening_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY screening_configs_select
  ON screening_configs FOR SELECT
  USING (organization_id = current_user_org_id());

CREATE POLICY screening_configs_insert
  ON screening_configs FOR INSERT
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY screening_configs_update
  ON screening_configs FOR UPDATE
  USING (organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY screening_configs_delete
  ON screening_configs FOR DELETE
  USING (organization_id = current_user_org_id());

-- ADR-007: Audit trigger
CREATE TRIGGER screening_configs_audit
  AFTER INSERT OR UPDATE OR DELETE ON screening_configs
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ─── screening_sessions ─────────────────────────────────────

CREATE TABLE screening_sessions (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  application_id   UUID           NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  candidate_id     UUID           NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  config_id        UUID           NOT NULL REFERENCES screening_configs(id) ON DELETE RESTRICT,
  status           TEXT           NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'in_progress', 'completed', 'abandoned', 'skipped')),
  turns            JSONB          NOT NULL DEFAULT '[]',
  ai_summary       TEXT,
  ai_score         NUMERIC(3,2),
  score_breakdown  JSONB,
  human_review_requested BOOLEAN  NOT NULL DEFAULT FALSE,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX idx_screening_sessions_application ON screening_sessions(application_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_screening_sessions_candidate ON screening_sessions(candidate_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_screening_sessions_status ON screening_sessions(organization_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_screening_sessions_config ON screening_sessions(config_id)
  WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE screening_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY screening_sessions_select
  ON screening_sessions FOR SELECT
  USING (organization_id = current_user_org_id());

CREATE POLICY screening_sessions_insert
  ON screening_sessions FOR INSERT
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY screening_sessions_update
  ON screening_sessions FOR UPDATE
  USING (organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY screening_sessions_delete
  ON screening_sessions FOR DELETE
  USING (organization_id = current_user_org_id());

-- ADR-007: Audit trigger
CREATE TRIGGER screening_sessions_audit
  AFTER INSERT OR UPDATE OR DELETE ON screening_sessions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
