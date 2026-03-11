-- Migration 017: Fix JWT hook search_path for GoTrue
-- GoTrue runs hooks as supabase_auth_admin which has a different search_path.
-- The hook references organization_members and organizations without schema prefix,
-- causing "relation does not exist" errors. Fix: SET search_path in the function.

CREATE OR REPLACE FUNCTION custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

-- Re-grant after CREATE OR REPLACE
GRANT EXECUTE ON FUNCTION custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION custom_access_token_hook FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION custom_access_token_hook FROM anon;
REVOKE EXECUTE ON FUNCTION custom_access_token_hook FROM authenticated;
