-- Migration 025: candidate_notes table
-- P1-2 — recruiter notes + activity timeline on candidate profile.
-- ADR-006: soft delete via deleted_at.
-- ADR-007: audit trigger.

CREATE TABLE IF NOT EXISTS candidate_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  candidate_id UUID NOT NULL REFERENCES candidates(id),
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 5000),
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_candidate_notes_candidate ON candidate_notes (candidate_id, organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_candidate_notes_created_by ON candidate_notes (created_by)
  WHERE deleted_at IS NULL;

-- ─── RLS ─────────────────────────────────────────────────
ALTER TABLE candidate_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: any org member can read their org's notes
CREATE POLICY candidate_notes_select ON candidate_notes
  FOR SELECT USING (is_org_member(organization_id));

-- INSERT: org members, org_id must match, created_by = self
CREATE POLICY candidate_notes_insert ON candidate_notes
  FOR INSERT WITH CHECK (
    is_org_member(organization_id)
    AND created_by = auth.uid()
  );

-- UPDATE: only the note author can edit their own note
CREATE POLICY candidate_notes_update ON candidate_notes
  FOR UPDATE USING (
    is_org_member(organization_id)
    AND created_by = auth.uid()
  );

-- DELETE: author or owner/admin
CREATE POLICY candidate_notes_delete ON candidate_notes
  FOR DELETE USING (
    is_org_member(organization_id)
    AND (
      created_by = auth.uid()
      OR has_org_role(organization_id, 'owner', 'admin')
    )
  );

-- ─── Audit trigger (ADR-007) ─────────────────────────────
CREATE TRIGGER candidate_notes_audit
  AFTER INSERT OR UPDATE OR DELETE ON candidate_notes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
