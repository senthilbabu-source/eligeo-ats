-- Migration 003: RLS Helper Functions + JWT Claims Hook
-- Phase 1: Auth + Core Tenancy
-- Dependencies: 002 (organization_members, organizations tables must exist)

-- ─── RLS Helper: current_user_org_id() ───
-- Returns the user's active organization (ADR-005: last_active_org_id preference).
-- Used in RLS policies to scope all queries to the active org.
CREATE OR REPLACE FUNCTION current_user_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT om.organization_id
  FROM organization_members om
  WHERE om.user_id = auth.uid()
    AND om.is_active = TRUE
    AND om.deleted_at IS NULL
  ORDER BY (om.organization_id = om.last_active_org_id) DESC,
           om.joined_at ASC
  LIMIT 1;
$$;

-- ─── RLS Helper: is_org_member(org_id) ───
-- Returns TRUE if the current user is an active member of the given org.
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND is_active = TRUE
      AND deleted_at IS NULL
  );
$$;

-- ─── RLS Helper: has_org_role(org_id, ...roles) ───
-- Returns TRUE if the current user has one of the specified roles in the given org.
CREATE OR REPLACE FUNCTION has_org_role(org_id UUID, VARIADIC allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role = ANY(allowed_roles)
      AND is_active = TRUE
      AND deleted_at IS NULL
  );
$$;

-- ─── JWT Claims Hook: custom_access_token_hook() ───
-- Registered in Supabase Dashboard → Auth → Hooks.
-- Injects org_id, org_role, plan, feature_flags into JWT claims.
CREATE OR REPLACE FUNCTION custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  claims        JSONB;
  member_record RECORD;
BEGIN
  claims := event -> 'claims';

  SELECT
    om.organization_id,
    om.role,
    o.plan,
    o.feature_flags
  INTO member_record
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.user_id = (event ->> 'user_id')::UUID
    AND om.is_active = TRUE
    AND om.deleted_at IS NULL
    AND o.deleted_at IS NULL
  ORDER BY (om.organization_id = om.last_active_org_id) DESC,
           om.joined_at ASC
  LIMIT 1;

  IF member_record IS NOT NULL THEN
    claims := jsonb_set(claims, '{org_id}', to_jsonb(member_record.organization_id));
    claims := jsonb_set(claims, '{org_role}', to_jsonb(member_record.role));
    claims := jsonb_set(claims, '{plan}', to_jsonb(member_record.plan));
    claims := jsonb_set(claims, '{feature_flags}', member_record.feature_flags);
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execute to supabase_auth_admin so the hook can be called
GRANT EXECUTE ON FUNCTION custom_access_token_hook TO supabase_auth_admin;
-- Revoke from public for security
REVOKE EXECUTE ON FUNCTION custom_access_token_hook FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION custom_access_token_hook FROM anon;
REVOKE EXECUTE ON FUNCTION custom_access_token_hook FROM authenticated;
