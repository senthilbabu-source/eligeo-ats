-- Migration 022: AI-Proof Wave A — embedding staleness tracking + AI score feedback
-- Phase: AI-Proof Wave A (pre-Phase 3 correctness fixes)
-- Dependencies: 002 (organizations, user_profiles), 008 (job_openings), 011 (applications)

-- ─── 1. embedding_updated_at on job_openings ─────────────────
-- Tracks when job_embedding was last regenerated.
-- NULL = never re-embedded since initial insert (or not yet set).
-- When job_required_skills change or JD is updated, Inngest sets this
-- column to NULL (stale signal) then re-embeds and sets it to NOW().
ALTER TABLE job_openings
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

-- ─── 2. ai_score_feedback ──────────────────────────────────
-- Captures recruiter thumbs-up / thumbs-down on AI match scores.
-- Immutable by design: signals are never updated. Use deleted_at to retract.
CREATE TABLE ai_score_feedback (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id      UUID          NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  signal              TEXT          NOT NULL CHECK (signal IN ('thumbs_up', 'thumbs_down')),
  given_by            UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  given_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  match_score_at_time NUMERIC(5,2),  -- score at time of feedback (informational)
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_ai_score_feedback_org_app
  ON ai_score_feedback(organization_id, application_id)
  WHERE deleted_at IS NULL;

ALTER TABLE ai_score_feedback ENABLE ROW LEVEL SECURITY;

-- SELECT: any active org member can see all feedback in their org
CREATE POLICY "ai_score_feedback_select" ON ai_score_feedback FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

-- INSERT: any active org member may insert their own signal only
--   given_by must equal auth.uid() (user_profiles.id = auth.users.id per Migration 002)
CREATE POLICY "ai_score_feedback_insert" ON ai_score_feedback FOR INSERT
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = current_user_org_id()
    AND given_by = auth.uid()
  );

-- UPDATE: DENIED — signals are immutable. Retract by setting deleted_at (service role).
-- No UPDATE policy created.

-- DELETE: submitter, owner, or admin may hard-delete (soft delete preferred)
CREATE POLICY "ai_score_feedback_delete" ON ai_score_feedback FOR DELETE
  USING (
    is_org_member(organization_id)
    AND (
      given_by = auth.uid()
      OR has_org_role(organization_id, 'owner', 'admin')
    )
  );

-- Audit trigger (ADR-007)
CREATE TRIGGER trg_ai_score_feedback_audit
  AFTER INSERT OR UPDATE OR DELETE ON ai_score_feedback
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
