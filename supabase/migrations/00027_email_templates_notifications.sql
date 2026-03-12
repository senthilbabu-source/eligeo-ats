-- ============================================================
-- Migration 027: Email Templates + Notification Preferences
-- Wave F — Notification cluster (prerequisite for Phase 4 Offers)
-- ============================================================
-- Tables: email_templates, notification_preferences
-- Source: docs/schema/07-communications-files.md (D07)
-- ADRs: ADR-006 (soft delete), ADR-007 (audit triggers), ADR-008 (CHECK enums)
-- ============================================================

-- ─── email_templates ─────────────────────────────────────────

CREATE TABLE email_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  subject         TEXT        NOT NULL,
  body_html       TEXT        NOT NULL,
  body_text       TEXT,
  category        TEXT        NOT NULL
                              CHECK (category IN ('interview_invite', 'rejection', 'offer', 'follow_up', 'nurture', 'custom')),
  merge_fields    TEXT[]      NOT NULL DEFAULT '{}',
  is_system       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);

-- Org-scoped template listing (email composer dropdown, settings page)
CREATE INDEX idx_email_templates_org
  ON email_templates(organization_id, category)
  WHERE deleted_at IS NULL;

-- System template lookup (seeded defaults that can't be deleted)
CREATE INDEX idx_email_templates_system
  ON email_templates(organization_id)
  WHERE is_system = TRUE AND deleted_at IS NULL;

-- ─── email_templates RLS ─────────────────────────────────────

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY "email_templates_select" ON email_templates FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "email_templates_insert" ON email_templates FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "email_templates_update" ON email_templates FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "email_templates_delete" ON email_templates FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
    AND is_system = FALSE
  );

-- ─── email_templates triggers ────────────────────────────────

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ─── notification_preferences ────────────────────────────────

CREATE TABLE notification_preferences (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  channel         TEXT        NOT NULL DEFAULT 'both'
                              CHECK (channel IN ('in_app', 'email', 'both', 'none')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (user_id, event_type)
);

-- User's preferences lookup (notification settings page, dispatch logic)
CREATE INDEX idx_notification_prefs_user
  ON notification_preferences(user_id, event_type)
  WHERE deleted_at IS NULL;

-- Org-scoped lookup for admin management
CREATE INDEX idx_notification_prefs_org
  ON notification_preferences(organization_id)
  WHERE deleted_at IS NULL;

-- ─── notification_preferences RLS ────────────────────────────

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY "notification_prefs_select" ON notification_preferences FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
    AND (
      user_id = auth.uid()
      OR has_org_role(organization_id, 'owner', 'admin')
    )
  );

CREATE POLICY "notification_prefs_insert" ON notification_preferences FOR INSERT
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = current_user_org_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "notification_prefs_update" ON notification_preferences FOR UPDATE
  USING (
    organization_id = current_user_org_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "notification_prefs_delete" ON notification_preferences FOR DELETE
  USING (
    organization_id = current_user_org_id()
    AND user_id = auth.uid()
  );

-- ─── notification_preferences triggers ───────────────────────

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
