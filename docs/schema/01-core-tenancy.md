# D01 — Core Tenancy Tables

> Sub-document of [DATABASE-SCHEMA.md](../DATABASE-SCHEMA.md)
> Tables: `organizations`, `user_profiles`, `organization_members`

---

## `organizations`

```sql
CREATE TABLE organizations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  slug             TEXT        UNIQUE NOT NULL
                               CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  plan             TEXT        NOT NULL DEFAULT 'starter'
                               CHECK (plan IN ('starter', 'growth', 'pro', 'enterprise')),
  custom_domain    TEXT        UNIQUE,
  branding_config  JSONB       NOT NULL DEFAULT '{}',  -- see BrandingConfig interface
  feature_flags    JSONB       NOT NULL DEFAULT '{}',  -- see FeatureFlags interface
  timezone         TEXT        NOT NULL DEFAULT 'UTC',
  ai_credits_used  INTEGER     NOT NULL DEFAULT 0,
  ai_credits_limit INTEGER     NOT NULL DEFAULT 0,  -- plan setup sets real value; 0 = no credits until plan assigned
  data_region      TEXT        NOT NULL DEFAULT 'us-east-1',
  billing_email    TEXT,
  stripe_customer_id TEXT      UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
```

### Indexes

```sql
-- Slug lookup for subdomain routing (proxy.ts)
CREATE INDEX idx_orgs_slug ON organizations(slug) WHERE deleted_at IS NULL;

-- Custom domain lookup for white-label routing
CREATE INDEX idx_orgs_domain ON organizations(custom_domain)
  WHERE custom_domain IS NOT NULL AND deleted_at IS NULL;

-- Stripe customer lookup for webhook handling
CREATE UNIQUE INDEX idx_orgs_stripe ON organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
```

### RLS

```sql
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

CREATE POLICY "orgs_select" ON organizations FOR SELECT
  USING (is_org_member(id) AND deleted_at IS NULL);

CREATE POLICY "orgs_insert" ON organizations FOR INSERT
  WITH CHECK (TRUE);  -- Signup flow creates org before membership exists

CREATE POLICY "orgs_update" ON organizations FOR UPDATE
  USING (has_org_role(id, 'owner', 'admin'))
  WITH CHECK (id = current_user_org_id());

CREATE POLICY "orgs_delete" ON organizations FOR DELETE
  USING (FALSE);  -- Organizations are deactivated (deleted_at), never hard-deleted
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON organizations
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `user_profiles`

Extends `auth.users` with application-specific data. PK references `auth.users(id)` directly.

```sql
CREATE TABLE user_profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT,
  avatar_url   TEXT,
  timezone     TEXT        NOT NULL DEFAULT 'UTC',
  locale       TEXT        NOT NULL DEFAULT 'en',
  preferences  JSONB       NOT NULL DEFAULT '{}',  -- see UserPreferences interface
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
```

### RLS

```sql
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles FORCE ROW LEVEL SECURITY;

-- Users can see profiles of anyone in their organization
CREATE POLICY "profiles_select" ON user_profiles FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM organization_members om1
        JOIN organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.user_id = auth.uid() AND om2.user_id = user_profiles.id
          AND om1.is_active = TRUE AND om2.is_active = TRUE
      )
    )
  );

CREATE POLICY "profiles_insert" ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update" ON user_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_delete" ON user_profiles FOR DELETE
  USING (FALSE);  -- Profiles are deactivated via auth.users, never hard-deleted
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `organization_members`

Junction table linking users to organizations with role-based access.

```sql
CREATE TABLE organization_members (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role                TEXT        NOT NULL
                                  CHECK (role IN ('owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer')),
  custom_permissions  JSONB       NOT NULL DEFAULT '{}',  -- see CustomPermissions interface
  last_active_org_id  UUID        REFERENCES organizations(id) ON DELETE SET NULL,  -- ADR-005: multi-org switching
  invited_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_token        TEXT        UNIQUE,
  invite_expires_at   TIMESTAMPTZ,
  invited_at          TIMESTAMPTZ,
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,

  UNIQUE (organization_id, user_id)
);
```

### Indexes

```sql
-- User's memberships (org-switcher, JWT hook)
CREATE INDEX idx_om_user_id ON organization_members(user_id) WHERE is_active = TRUE;

-- Org's member list
CREATE INDEX idx_om_org_id ON organization_members(organization_id) WHERE is_active = TRUE;

-- Invite token lookup (one-time invite link)
CREATE UNIQUE INDEX idx_om_invite_token ON organization_members(invite_token)
  WHERE invite_token IS NOT NULL;
```

### RLS

```sql
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members FORCE ROW LEVEL SECURITY;

CREATE POLICY "members_select" ON organization_members FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "members_insert" ON organization_members FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin')
    OR organization_id = current_user_org_id()  -- Self-join via invite
  );

CREATE POLICY "members_update" ON organization_members FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    OR user_id = auth.uid()  -- Users can update their own last_active_org_id
  )
  WITH CHECK (organization_id = current_user_org_id() OR user_id = auth.uid());

CREATE POLICY "members_delete" ON organization_members FOR DELETE
  USING (has_org_role(organization_id, 'owner'));
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```
