-- Migration 018: Fix overly permissive members_insert RLS policy
--
-- SECURITY FIX: The original policy allowed any authenticated user to add
-- themselves to ANY org via `user_id = auth.uid()`. This was intended for
-- the signup flow (first member of a new org) but permitted unauthorized
-- org joining.
--
-- Fix: Self-insert is only allowed when the org has NO existing members
-- (the signup/org-creation case). Otherwise, only owner/admin can insert
-- (the invite case).
--
-- NOTE: The existence check uses a SECURITY DEFINER function because the
-- inline NOT EXISTS subquery would be subject to RLS — the inserting user
-- can't see the target org's members, so the subquery would return empty,
-- defeating the check.

-- Helper: check if an org has any members (bypasses RLS)
CREATE OR REPLACE FUNCTION org_has_members(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = target_org_id
      AND deleted_at IS NULL
  );
$$;

DROP POLICY "members_insert" ON organization_members;

CREATE POLICY "members_insert" ON organization_members FOR INSERT
  WITH CHECK (
    -- Owner/admin can invite new members to their org
    has_org_role(organization_id, 'owner', 'admin')
    -- OR: self-insert as first member during org creation (signup flow only)
    OR (
      user_id = auth.uid()
      AND NOT org_has_members(organization_id)
    )
  );
