-- Migration 030: Phase 6 Foundation (Waves P6-1 + P6-2)
-- Dependencies: 00009 (candidates), 00029 (hardening)
-- Adds: resume_parsed_at column, candidate_merges table, merge_candidates RPC

-- ─── P6-1: Resume Extraction ────────────────────────────────

-- Track when resume was last parsed (fixes H6-4 phantom reference)
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS resume_parsed_at TIMESTAMPTZ;

-- ─── P6-2b: Candidate Merge ────────────────────────────────

-- candidate_merges — immutable audit trail for merged duplicates
-- ADR-006 exception: no deleted_at (immutable audit record, like audit_logs)
CREATE TABLE candidate_merges (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID           NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  primary_id        UUID           NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  secondary_id      UUID           NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  merged_by         UUID           NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  ai_confidence     NUMERIC(3,2),
  merge_reason      TEXT,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_candidate_merges_org ON candidate_merges(organization_id);
CREATE INDEX idx_candidate_merges_primary ON candidate_merges(primary_id);
CREATE INDEX idx_candidate_merges_secondary ON candidate_merges(secondary_id);

-- RLS — org-scoped, immutable (SELECT + INSERT only)
ALTER TABLE candidate_merges ENABLE ROW LEVEL SECURITY;

CREATE POLICY candidate_merges_select
  ON candidate_merges FOR SELECT
  USING (organization_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);

CREATE POLICY candidate_merges_insert
  ON candidate_merges FOR INSERT
  WITH CHECK (organization_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);

-- No UPDATE or DELETE policies — immutable audit record

-- ADR-007: Audit trigger
CREATE TRIGGER candidate_merges_audit
  AFTER INSERT ON candidate_merges
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ─── P6-2b: merge_candidates RPC ───────────────────────────

CREATE OR REPLACE FUNCTION merge_candidates(
  p_primary_id UUID,
  p_secondary_id UUID,
  p_org_id UUID,
  p_merged_by UUID,
  p_ai_confidence NUMERIC DEFAULT NULL,
  p_merge_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary_org UUID;
  v_secondary_org UUID;
BEGIN
  -- Validate both candidates belong to the same org
  SELECT organization_id INTO v_primary_org
    FROM candidates WHERE id = p_primary_id AND deleted_at IS NULL;
  SELECT organization_id INTO v_secondary_org
    FROM candidates WHERE id = p_secondary_id AND deleted_at IS NULL;

  IF v_primary_org IS NULL OR v_secondary_org IS NULL THEN
    RAISE EXCEPTION 'One or both candidates not found';
  END IF;

  IF v_primary_org != p_org_id OR v_secondary_org != p_org_id THEN
    RAISE EXCEPTION 'Candidates do not belong to the specified organization';
  END IF;

  -- Set tenant context for RLS in downstream triggers
  PERFORM set_config('app.current_org_id', p_org_id::text, true);

  -- 1. Repoint applications (skip duplicates for same job)
  UPDATE applications
    SET candidate_id = p_primary_id, updated_at = NOW()
    WHERE candidate_id = p_secondary_id
      AND organization_id = p_org_id
      AND job_opening_id NOT IN (
        SELECT job_opening_id FROM applications
        WHERE candidate_id = p_primary_id AND organization_id = p_org_id AND deleted_at IS NULL
      );

  -- Soft-delete secondary's duplicate-job applications
  UPDATE applications
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE candidate_id = p_secondary_id
      AND organization_id = p_org_id
      AND deleted_at IS NULL;

  -- 2. Merge candidate_skills (skip duplicates)
  INSERT INTO candidate_skills (organization_id, candidate_id, skill_id, proficiency, source, created_at)
    SELECT p_org_id, p_primary_id, cs.skill_id, cs.proficiency, cs.source, NOW()
    FROM candidate_skills cs
    WHERE cs.candidate_id = p_secondary_id
      AND cs.organization_id = p_org_id
      AND cs.deleted_at IS NULL
      AND cs.skill_id NOT IN (
        SELECT skill_id FROM candidate_skills
        WHERE candidate_id = p_primary_id AND organization_id = p_org_id AND deleted_at IS NULL
      );

  -- 3. Repoint notes
  UPDATE candidate_notes
    SET candidate_id = p_primary_id, updated_at = NOW()
    WHERE candidate_id = p_secondary_id
      AND organization_id = p_org_id;

  -- 4. Repoint files
  UPDATE files
    SET entity_id = p_primary_id, updated_at = NOW()
    WHERE entity_id = p_secondary_id
      AND entity_type = 'candidate'
      AND organization_id = p_org_id;

  -- 5. Create merge audit record
  INSERT INTO candidate_merges (organization_id, primary_id, secondary_id, merged_by, ai_confidence, merge_reason)
    VALUES (p_org_id, p_primary_id, p_secondary_id, p_merged_by, p_ai_confidence, p_merge_reason);

  -- 6. Soft-delete secondary candidate
  UPDATE candidates
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = p_secondary_id AND organization_id = p_org_id;

  RETURN p_primary_id;
END;
$$;
