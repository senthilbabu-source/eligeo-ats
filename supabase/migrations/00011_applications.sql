-- Migration 011: Applications + Stage History
-- Phase 2: Jobs + Career Portal
-- Dependencies: 00002 (organizations), 00007 (pipeline_stages), 00008 (job_openings),
--              00009 (candidates), 00006 (rejection_reasons)

-- ─── applications ──────────────────────────────────────────

CREATE TABLE applications (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  candidate_id        UUID        NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  job_opening_id      UUID        NOT NULL REFERENCES job_openings(id) ON DELETE RESTRICT,
  current_stage_id    UUID        REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  status              TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'hired', 'rejected', 'withdrawn')),
  rejection_reason_id UUID        REFERENCES rejection_reasons(id) ON DELETE SET NULL,
  rejection_notes     TEXT,
  applied_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hired_at            TIMESTAMPTZ,
  rejected_at         TIMESTAMPTZ,
  withdrawn_at        TIMESTAMPTZ,
  source              TEXT,
  referrer_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  score               NUMERIC(5,2),
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ DEFAULT NULL,

  -- One application per candidate per job
  UNIQUE (candidate_id, job_opening_id)
);

CREATE INDEX idx_applications_job
  ON applications(job_opening_id, current_stage_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_applications_candidate
  ON applications(candidate_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_applications_org_status
  ON applications(organization_id, status)
  WHERE deleted_at IS NULL;

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;

CREATE POLICY "applications_select" ON applications FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "applications_insert" ON applications FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "applications_update" ON applications FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "applications_delete" ON applications FOR DELETE
  USING (has_org_role(organization_id, 'owner', 'admin') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_applications_audit
  AFTER INSERT OR UPDATE OR DELETE ON applications
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ─── application_stage_history (append-only) ───────────────

CREATE TABLE application_stage_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  application_id   UUID        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_stage_id    UUID        REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id      UUID        NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  transitioned_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_stage_history_application
  ON application_stage_history(application_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_stage_history_org
  ON application_stage_history(organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE application_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_stage_history FORCE ROW LEVEL SECURITY;

CREATE POLICY "stage_history_select" ON application_stage_history FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "stage_history_insert" ON application_stage_history FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
    AND organization_id = current_user_org_id()
  );

-- Append-only: no updates or deletes
CREATE POLICY "stage_history_update" ON application_stage_history FOR UPDATE
  USING (FALSE);

CREATE POLICY "stage_history_delete" ON application_stage_history FOR DELETE
  USING (FALSE);

CREATE TRIGGER trg_stage_history_audit
  AFTER INSERT OR UPDATE OR DELETE ON application_stage_history
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
