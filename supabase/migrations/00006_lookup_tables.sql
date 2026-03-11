-- Migration 006: Lookup Tables (candidate_sources, rejection_reasons)
-- Phase 2: Jobs + Career Portal
-- Dependencies: 00002 (organizations)
-- These are tenant-configurable lookup tables (ADR-008).

-- ─── candidate_sources ─────────────────────────────────────

CREATE TABLE candidate_sources (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  is_system       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (organization_id, name)
);

CREATE INDEX idx_candidate_sources_org
  ON candidate_sources(organization_id)
  WHERE deleted_at IS NULL;

ALTER TABLE candidate_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_sources FORCE ROW LEVEL SECURITY;

CREATE POLICY "candidate_sources_select" ON candidate_sources FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "candidate_sources_insert" ON candidate_sources FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "candidate_sources_update" ON candidate_sources FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "candidate_sources_delete" ON candidate_sources FOR DELETE
  USING (has_org_role(organization_id, 'owner', 'admin') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_candidate_sources_audit
  AFTER INSERT OR UPDATE OR DELETE ON candidate_sources
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ─── rejection_reasons ─────────────────────────────────────

CREATE TABLE rejection_reasons (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  is_system       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (organization_id, name)
);

CREATE INDEX idx_rejection_reasons_org
  ON rejection_reasons(organization_id)
  WHERE deleted_at IS NULL;

ALTER TABLE rejection_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejection_reasons FORCE ROW LEVEL SECURITY;

CREATE POLICY "rejection_reasons_select" ON rejection_reasons FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "rejection_reasons_insert" ON rejection_reasons FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "rejection_reasons_update" ON rejection_reasons FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "rejection_reasons_delete" ON rejection_reasons FOR DELETE
  USING (has_org_role(organization_id, 'owner', 'admin') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_rejection_reasons_audit
  AFTER INSERT OR UPDATE OR DELETE ON rejection_reasons
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
