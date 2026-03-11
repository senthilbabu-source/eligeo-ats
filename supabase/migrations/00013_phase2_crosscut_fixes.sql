-- Migration 013: Phase 2 Cross-Cut Analysis Fixes
-- Fixes: missing hiring_manager RLS roles, auto_actions default, missing indexes

-- ─── Critical: Add hiring_manager to candidates INSERT policy ─────────

DROP POLICY "candidates_insert" ON candidates;
CREATE POLICY "candidates_insert" ON candidates FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
    AND organization_id = current_user_org_id()
  );

-- ─── Critical: Add hiring_manager to applications INSERT policy ──────

DROP POLICY "applications_insert" ON applications;
CREATE POLICY "applications_insert" ON applications FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
    AND organization_id = current_user_org_id()
  );

-- ─── Critical: Fix auto_actions default from array to empty array ────
-- Note: The AutoAction type IS an array (AutoAction[]), so '[]' is correct
-- as the default. The cross-cut flagged this as object but spec confirms
-- auto_actions stores an ARRAY of action objects, not a single object.
-- Keeping '[]' — no change needed here.

-- ─── Medium: Missing referrer index on applications ──────────────────

CREATE INDEX idx_applications_referrer
  ON applications(referrer_id)
  WHERE deleted_at IS NULL AND referrer_id IS NOT NULL;

-- ─── Medium: Missing stage history composite index for analytics ─────

CREATE INDEX idx_stage_history_to_stage
  ON application_stage_history(to_stage_id, created_at);

-- ─── Medium: Missing org index on talent_pool_members ────────────────

CREATE INDEX idx_pool_members_org
  ON talent_pool_members(organization_id)
  WHERE deleted_at IS NULL;
