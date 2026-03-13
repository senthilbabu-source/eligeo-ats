-- Migration 031: AI Shortlist Reports (Wave P6-5)
-- Dependencies: 00030 (phase6_foundation), 00009 (candidates), 00011 (applications), 00008 (job_openings)
-- Adds: ai_shortlist_reports + ai_shortlist_candidates tables

-- ─── ai_shortlist_reports ─────────────────────────────────────

CREATE TABLE ai_shortlist_reports (
  id                      UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  job_opening_id          UUID           NOT NULL REFERENCES job_openings(id) ON DELETE RESTRICT,
  triggered_by            UUID           NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  status                  TEXT           NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','complete','failed')),
  total_applications      INTEGER        NOT NULL DEFAULT 0,
  shortlist_count         INTEGER        NOT NULL DEFAULT 0,
  hold_count              INTEGER        NOT NULL DEFAULT 0,
  reject_count            INTEGER        NOT NULL DEFAULT 0,
  insufficient_data_count INTEGER        NOT NULL DEFAULT 0,
  executive_summary       TEXT,
  hiring_manager_note     TEXT,
  completed_at            TIMESTAMPTZ,
  error_message           TEXT,
  created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);

CREATE INDEX idx_shortlist_reports_job ON ai_shortlist_reports(job_opening_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_shortlist_reports_org ON ai_shortlist_reports(organization_id)
  WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE ai_shortlist_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY shortlist_reports_select
  ON ai_shortlist_reports FOR SELECT
  USING (organization_id = current_user_org_id());

CREATE POLICY shortlist_reports_insert
  ON ai_shortlist_reports FOR INSERT
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY shortlist_reports_update
  ON ai_shortlist_reports FOR UPDATE
  USING (organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

-- No DELETE policy — soft delete only (ADR-006)

-- ADR-007: Audit trigger
CREATE TRIGGER shortlist_reports_audit
  AFTER INSERT OR UPDATE ON ai_shortlist_reports
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ─── ai_shortlist_candidates ──────────────────────────────────

CREATE TABLE ai_shortlist_candidates (
  id                      UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  report_id               UUID           NOT NULL REFERENCES ai_shortlist_reports(id) ON DELETE RESTRICT,
  application_id          UUID           NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  candidate_id            UUID           NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,

  -- Tier
  ai_tier                 TEXT           NOT NULL
                          CHECK (ai_tier IN ('shortlist','hold','reject','insufficient_data')),
  recruiter_tier          TEXT
                          CHECK (recruiter_tier IS NULL OR recruiter_tier IN ('shortlist','hold','reject','insufficient_data')),
  tier_overridden_at      TIMESTAMPTZ,
  tier_overridden_by      UUID           REFERENCES user_profiles(id),

  -- Composite + dimension scores (0.0–1.0)
  composite_score         NUMERIC(4,3),
  skills_score            NUMERIC(4,3),
  experience_score        NUMERIC(4,3),
  education_score         NUMERIC(4,3),
  domain_score            NUMERIC(4,3),
  trajectory_score        NUMERIC(4,3),

  -- AI reasoning
  strengths               TEXT[],
  gaps                    TEXT[],
  clarifying_question     TEXT,
  reject_reason           TEXT,
  eeoc_flags              TEXT[],

  -- Metadata
  scored_at               TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);

CREATE INDEX idx_shortlist_candidates_report ON ai_shortlist_candidates(report_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_shortlist_candidates_app ON ai_shortlist_candidates(application_id)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_shortlist_candidates_unique
  ON ai_shortlist_candidates(report_id, application_id)
  WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE ai_shortlist_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY shortlist_candidates_select
  ON ai_shortlist_candidates FOR SELECT
  USING (organization_id = current_user_org_id());

CREATE POLICY shortlist_candidates_insert
  ON ai_shortlist_candidates FOR INSERT
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY shortlist_candidates_update
  ON ai_shortlist_candidates FOR UPDATE
  USING (organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

-- No DELETE policy — soft delete only (ADR-006)

-- ADR-007: Audit trigger
CREATE TRIGGER shortlist_candidates_audit
  AFTER INSERT OR UPDATE ON ai_shortlist_candidates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
