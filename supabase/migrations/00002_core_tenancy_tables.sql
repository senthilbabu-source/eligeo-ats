-- Migration 002: Core Tenancy Tables
-- Phase 1: Auth + Core Tenancy
-- Dependencies: 00001 (extensions + functions)
-- Batch 1-3 per D01 Migration Ordering

-- ─── Batch 1: organizations (anchor table) ───
CREATE TABLE organizations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  slug             TEXT        UNIQUE NOT NULL
                               CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  plan             TEXT        NOT NULL DEFAULT 'starter'
                               CHECK (plan IN ('starter', 'growth', 'pro', 'enterprise')),
  subscription_status TEXT     NOT NULL DEFAULT 'trialing'
                               CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  custom_domain    TEXT        UNIQUE,
  branding_config  JSONB       NOT NULL DEFAULT '{}',
  feature_flags    JSONB       NOT NULL DEFAULT '{}',
  timezone         TEXT        NOT NULL DEFAULT 'UTC',
  ai_credits_used  INTEGER     NOT NULL DEFAULT 0,
  ai_credits_limit INTEGER     NOT NULL DEFAULT 0,
  data_region      TEXT        NOT NULL DEFAULT 'us-east-1',
  billing_email    TEXT,
  stripe_customer_id    TEXT   UNIQUE,
  stripe_subscription_id TEXT  UNIQUE,
  trial_ends_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

-- Index: slug lookup (most common query for career pages)
CREATE INDEX idx_orgs_slug ON organizations(slug) WHERE deleted_at IS NULL;
-- Index: custom domain resolution
CREATE INDEX idx_orgs_domain ON organizations(custom_domain)
  WHERE custom_domain IS NOT NULL AND deleted_at IS NULL;
-- Index: Stripe customer lookup (webhook processing)
CREATE UNIQUE INDEX idx_orgs_stripe_customer ON organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
-- Index: Stripe subscription lookup
CREATE UNIQUE INDEX idx_orgs_stripe_subscription ON organizations(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON TABLE organizations IS 'Tenant anchor table. Every row is a separate tenant.';
COMMENT ON COLUMN organizations.slug IS 'URL-safe identifier for career pages: eligeo.io/career/{slug}';
COMMENT ON COLUMN organizations.plan IS 'Current billing plan tier (CHECK constraint per ADR-008)';
COMMENT ON COLUMN organizations.subscription_status IS 'Synced from Stripe via webhooks. Stripe is source of truth (P-16).';
COMMENT ON COLUMN organizations.feature_flags IS 'Plan-gated feature flags. See FeatureFlags TypeScript interface.';
COMMENT ON COLUMN organizations.branding_config IS 'Career page customization. See BrandingConfig TypeScript interface.';

-- ─── Batch 2: user_profiles (auth bridge) ───
CREATE TABLE user_profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT,
  avatar_url   TEXT,
  timezone     TEXT        NOT NULL DEFAULT 'UTC',
  locale       TEXT        NOT NULL DEFAULT 'en',
  preferences  JSONB       NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

COMMENT ON TABLE user_profiles IS 'Extended profile for auth.users. PK = auth.users.id (no type mismatch per P-05).';
COMMENT ON COLUMN user_profiles.preferences IS 'User UI preferences. See UserPreferences TypeScript interface.';

-- ─── Batch 3: organization_members (junction) ───
CREATE TABLE organization_members (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role                TEXT        NOT NULL
                                  CHECK (role IN ('owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer')),
  custom_permissions  JSONB       NOT NULL DEFAULT '{}',
  last_active_org_id  UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  invited_by          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_token        TEXT        UNIQUE,
  invite_expires_at   TIMESTAMPTZ,
  invited_at          TIMESTAMPTZ,
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT uq_org_user UNIQUE (organization_id, user_id)
);

-- Index: lookup by user (org switching, JWT hook)
CREATE INDEX idx_om_user_id ON organization_members(user_id)
  WHERE is_active = TRUE AND deleted_at IS NULL;
-- Index: lookup by org (member listing)
CREATE INDEX idx_om_org_id ON organization_members(organization_id)
  WHERE is_active = TRUE AND deleted_at IS NULL;
-- Index: invite token lookup (accept-invite flow)
CREATE UNIQUE INDEX idx_om_invite_token ON organization_members(invite_token)
  WHERE invite_token IS NOT NULL;

COMMENT ON TABLE organization_members IS 'Multi-org membership junction. ADR-005: last_active_org_id for org switching.';
COMMENT ON COLUMN organization_members.role IS 'RBAC role (CHECK constraint per ADR-008). See D02 permission matrix.';
COMMENT ON COLUMN organization_members.last_active_org_id IS 'ADR-005: Preferred org for JWT claims hook. Updated on org switch.';
COMMENT ON COLUMN organization_members.invite_token IS 'Unique token for pending invites. NULL after acceptance.';
