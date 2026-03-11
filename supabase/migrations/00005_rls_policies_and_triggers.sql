-- Migration 004: RLS Policies + Triggers
-- Phase 1: Auth + Core Tenancy
-- Dependencies: 00002 (tables), 00003 (audit_logs), 00001 (functions)
-- All 4 operations (SELECT/INSERT/UPDATE/DELETE) per table.
-- Every SELECT includes deleted_at IS NULL (ADR-006).

-- ════════════════════════════════════════
-- organizations
-- ════════════════════════════════════════
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

-- SELECT: User can see orgs they belong to
CREATE POLICY "orgs_select" ON organizations FOR SELECT
  USING (
    deleted_at IS NULL
    AND is_org_member(id)
  );

-- INSERT: Anyone can create an org (signup flow creates org before membership)
CREATE POLICY "orgs_insert" ON organizations FOR INSERT
  WITH CHECK (TRUE);

-- UPDATE: Only owner/admin of the org
CREATE POLICY "orgs_update" ON organizations FOR UPDATE
  USING (
    deleted_at IS NULL
    AND has_org_role(id, 'owner', 'admin')
  );

-- DELETE: Never hard-delete (ADR-006)
CREATE POLICY "orgs_delete" ON organizations FOR DELETE
  USING (FALSE);

-- Triggers
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_organizations_audit
  AFTER INSERT OR UPDATE OR DELETE ON organizations
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ════════════════════════════════════════
-- user_profiles
-- ════════════════════════════════════════
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles FORCE ROW LEVEL SECURITY;

-- SELECT: Own profile + profiles of people in shared orgs
CREATE POLICY "profiles_select" ON user_profiles FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM organization_members om1
        JOIN organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.user_id = auth.uid()
          AND om2.user_id = user_profiles.id
          AND om1.is_active = TRUE AND om1.deleted_at IS NULL
          AND om2.is_active = TRUE AND om2.deleted_at IS NULL
      )
    )
  );

-- INSERT: Only own profile
CREATE POLICY "profiles_insert" ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- UPDATE: Only own profile
CREATE POLICY "profiles_update" ON user_profiles FOR UPDATE
  USING (id = auth.uid() AND deleted_at IS NULL);

-- DELETE: Never hard-delete
CREATE POLICY "profiles_delete" ON user_profiles FOR DELETE
  USING (FALSE);

-- Triggers
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ════════════════════════════════════════
-- organization_members
-- ════════════════════════════════════════
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members FORCE ROW LEVEL SECURITY;

-- SELECT: Members can see other members in their org
CREATE POLICY "members_select" ON organization_members FOR SELECT
  USING (
    deleted_at IS NULL
    AND is_org_member(organization_id)
  );

-- INSERT: Owner/admin can invite; or the user themselves during signup
CREATE POLICY "members_insert" ON organization_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR has_org_role(organization_id, 'owner', 'admin')
  );

-- UPDATE: Owner/admin can update members; users can update own record (last_active_org_id)
CREATE POLICY "members_update" ON organization_members FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      has_org_role(organization_id, 'owner', 'admin')
      OR user_id = auth.uid()
    )
  );

-- DELETE: Owner only (soft-delete via deleted_at)
CREATE POLICY "members_delete" ON organization_members FOR DELETE
  USING (
    has_org_role(organization_id, 'owner')
  );

-- Triggers
CREATE TRIGGER trg_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_members_audit
  AFTER INSERT OR UPDATE OR DELETE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ════════════════════════════════════════
-- Auto-create user_profile on auth.users insert
-- ════════════════════════════════════════
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
