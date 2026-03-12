-- Migration 029: Pre-Phase 5 Hardening
-- H1-1: Atomic stage move RPC
-- H1-2: Offer approval locking RPC
-- H1-4: Email verification column
-- H2-1: Candidate skills_updated_at + trigger
-- H2-2: Staleness flag in match RPC (modify)
-- H3-2: AI match explanations table
-- H4-3: AI Act human_review_requested column

-- ═══════════════════════════════════════════════════════════
-- H1-1: Atomic stage move RPC
-- Wraps UPDATE applications + INSERT application_stage_history
-- in a single transaction to prevent split truth.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION move_application_stage(
  p_application_id UUID,
  p_organization_id UUID,
  p_to_stage_id UUID,
  p_transitioned_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  history_id UUID,
  from_stage_id UUID,
  to_stage_id UUID,
  candidate_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_stage_id UUID;
  v_candidate_id UUID;
  v_history_id UUID;
BEGIN
  -- 1. Fetch + validate application exists and belongs to org
  SELECT a.current_stage_id, a.candidate_id
    INTO v_from_stage_id, v_candidate_id
    FROM applications a
   WHERE a.id = p_application_id
     AND a.organization_id = p_organization_id
     AND a.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found or access denied'
      USING ERRCODE = 'P0002'; -- no_data_found
  END IF;

  -- 2. Validate target stage exists and belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM pipeline_stages
     WHERE id = p_to_stage_id
       AND organization_id = p_organization_id
       AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target stage not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Atomic: update current_stage_id + insert history in one transaction
  UPDATE applications
     SET current_stage_id = p_to_stage_id
   WHERE id = p_application_id
     AND organization_id = p_organization_id;

  INSERT INTO application_stage_history (
    organization_id, application_id, from_stage_id, to_stage_id,
    transitioned_by, reason
  )
  VALUES (
    p_organization_id, p_application_id, v_from_stage_id, p_to_stage_id,
    p_transitioned_by, p_reason
  )
  RETURNING id INTO v_history_id;

  RETURN QUERY SELECT v_history_id, v_from_stage_id, p_to_stage_id, v_candidate_id;
END;
$$;


-- ═══════════════════════════════════════════════════════════
-- H1-2: Offer approval locking RPC
-- Uses SELECT FOR UPDATE on offers row to prevent concurrent
-- approval race conditions.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION approve_offer_rpc(
  p_offer_id UUID,
  p_approval_id UUID,
  p_approver_id UUID,
  p_organization_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  offer_advanced BOOLEAN,
  remaining_count INTEGER,
  offer_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer_status TEXT;
  v_remaining INTEGER;
BEGIN
  -- 1. Lock the offer row to prevent concurrent modifications
  SELECT o.status INTO v_offer_status
    FROM offers o
   WHERE o.id = p_offer_id
     AND o.organization_id = p_organization_id
     AND o.deleted_at IS NULL
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found or access denied'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_offer_status != 'pending_approval' THEN
    RAISE EXCEPTION 'Offer is not in pending_approval state (current: %)', v_offer_status
      USING ERRCODE = 'P0001'; -- raise_exception
  END IF;

  -- 2. Mark the specific approval as approved
  UPDATE offer_approvals
     SET status = 'approved',
         decided_at = NOW(),
         notes = p_notes
   WHERE id = p_approval_id
     AND offer_id = p_offer_id
     AND approver_id = p_approver_id
     AND organization_id = p_organization_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found, already decided, or access denied'
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Count remaining pending approvals (fresh data, inside lock)
  SELECT COUNT(*)::INTEGER INTO v_remaining
    FROM offer_approvals
   WHERE offer_id = p_offer_id
     AND organization_id = p_organization_id
     AND status = 'pending'
     AND deleted_at IS NULL;

  -- 4. If no pending approvals remain, advance offer to approved
  IF v_remaining = 0 THEN
    UPDATE offers
       SET status = 'approved'
     WHERE id = p_offer_id
       AND organization_id = p_organization_id;

    RETURN QUERY SELECT TRUE, 0, 'approved'::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, v_remaining, v_offer_status;
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════
-- H1-4: Email verification column on candidates
-- ═══════════════════════════════════════════════════════════

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;


-- ═══════════════════════════════════════════════════════════
-- H2-1: Candidate skills_updated_at + trigger
-- ═══════════════════════════════════════════════════════════

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS skills_updated_at TIMESTAMPTZ;

-- Trigger: set skills_updated_at when candidate_skills changes
CREATE OR REPLACE FUNCTION touch_candidate_skills_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE candidates
     SET skills_updated_at = NOW()
   WHERE id = COALESCE(NEW.candidate_id, OLD.candidate_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_candidate_skills_updated
  AFTER INSERT OR UPDATE OR DELETE ON candidate_skills
  FOR EACH ROW EXECUTE FUNCTION touch_candidate_skills_timestamp();


-- ═══════════════════════════════════════════════════════════
-- H3-2: AI match explanations table
-- ═══════════════════════════════════════════════════════════

CREATE TABLE ai_match_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_opening_id UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
  explanation TEXT NOT NULL,
  key_matches TEXT[] NOT NULL DEFAULT '{}',
  key_gaps TEXT[] NOT NULL DEFAULT '{}',
  similarity_score NUMERIC(4,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE (organization_id, candidate_id, job_opening_id)
);

-- Indexes
CREATE INDEX idx_match_explanations_job
  ON ai_match_explanations (job_opening_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_match_explanations_candidate
  ON ai_match_explanations (candidate_id)
  WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE ai_match_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_explanations_select" ON ai_match_explanations
  FOR SELECT USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "match_explanations_insert" ON ai_match_explanations
  FOR INSERT WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "match_explanations_update" ON ai_match_explanations
  FOR UPDATE USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "match_explanations_delete" ON ai_match_explanations
  FOR DELETE USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );

-- Audit trigger (ADR-007)
CREATE TRIGGER audit_ai_match_explanations
  AFTER INSERT OR UPDATE OR DELETE ON ai_match_explanations
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();


-- ═══════════════════════════════════════════════════════════
-- H4-3: AI Act — human_review_requested on applications
-- ═══════════════════════════════════════════════════════════

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS human_review_requested BOOLEAN NOT NULL DEFAULT FALSE;


-- ═══════════════════════════════════════════════════════════
-- H2-2: Modified match_candidates_for_job() — adds embedding_stale flag
-- Replaces the version from migration 00015.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION match_candidates_for_job(
  p_job_id UUID,
  p_organization_id UUID,
  p_similarity_threshold FLOAT DEFAULT 0.5,
  p_max_results INTEGER DEFAULT 50
) RETURNS TABLE (
  candidate_id UUID,
  full_name TEXT,
  email TEXT,
  current_title TEXT,
  skills TEXT[],
  similarity_score FLOAT,
  embedding_stale BOOLEAN
) AS $$
  SELECT
    c.id AS candidate_id,
    c.full_name,
    c.email,
    c.current_title,
    c.skills,
    1 - (c.candidate_embedding <=> j.job_embedding) AS similarity_score,
    COALESCE(c.skills_updated_at > c.embedding_updated_at, FALSE) AS embedding_stale
  FROM candidates c
  CROSS JOIN job_openings j
  WHERE j.id = p_job_id
    AND j.organization_id = p_organization_id
    AND c.organization_id = p_organization_id
    AND c.candidate_embedding IS NOT NULL
    AND j.job_embedding IS NOT NULL
    AND c.deleted_at IS NULL
    AND j.deleted_at IS NULL
    AND 1 - (c.candidate_embedding <=> j.job_embedding) >= p_similarity_threshold
  ORDER BY c.candidate_embedding <=> j.job_embedding ASC
  LIMIT p_max_results;
$$ LANGUAGE sql STABLE;
