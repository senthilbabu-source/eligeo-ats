-- Migration 012: Talent Pools
-- Phase 2: Jobs + Career Portal
-- Dependencies: 00002 (organizations), 00009 (candidates)

-- ─── talent_pools ──────────────────────────────────────────

CREATE TABLE talent_pools (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  description     TEXT,
  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (organization_id, name)
);

CREATE INDEX idx_talent_pools_org
  ON talent_pools(organization_id)
  WHERE deleted_at IS NULL;

ALTER TABLE talent_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_pools FORCE ROW LEVEL SECURITY;

CREATE POLICY "talent_pools_select" ON talent_pools FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "talent_pools_insert" ON talent_pools FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "talent_pools_update" ON talent_pools FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "talent_pools_delete" ON talent_pools FOR DELETE
  USING (has_org_role(organization_id, 'owner', 'admin') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_talent_pools_updated_at
  BEFORE UPDATE ON talent_pools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_talent_pools_audit
  AFTER INSERT OR UPDATE OR DELETE ON talent_pools
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ─── talent_pool_members ───────────────────────────────────

CREATE TABLE talent_pool_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  talent_pool_id  UUID        NOT NULL REFERENCES talent_pools(id) ON DELETE CASCADE,
  candidate_id    UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  added_by        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (talent_pool_id, candidate_id)
);

CREATE INDEX idx_pool_members_pool
  ON talent_pool_members(talent_pool_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_pool_members_candidate
  ON talent_pool_members(candidate_id)
  WHERE deleted_at IS NULL;

ALTER TABLE talent_pool_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_pool_members FORCE ROW LEVEL SECURITY;

CREATE POLICY "pool_members_select" ON talent_pool_members FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "pool_members_insert" ON talent_pool_members FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "pool_members_update" ON talent_pool_members FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "pool_members_delete" ON talent_pool_members FOR DELETE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_pool_members_audit
  AFTER INSERT OR UPDATE OR DELETE ON talent_pool_members
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
