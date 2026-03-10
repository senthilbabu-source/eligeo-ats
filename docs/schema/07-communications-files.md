# D07 — Communications, Files & Custom Fields

> Sub-document of [DATABASE-SCHEMA.md](../DATABASE-SCHEMA.md)
> Tables: `notes`, `email_templates`, `notification_preferences`, `files`, `custom_field_definitions`, `custom_field_values`

---

## `notes`

Internal notes and threaded comments attached to candidates, applications, job openings, or offers. Supports @mentions and private visibility for blind-review workflows.

```sql
CREATE TABLE notes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  author_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  candidate_id    UUID        NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  resource_type   TEXT        NOT NULL
                              CHECK (resource_type IN ('application', 'candidate', 'job_opening', 'offer')),
  resource_id     UUID        NOT NULL,
  content         TEXT        NOT NULL,
  is_private      BOOLEAN     NOT NULL DEFAULT FALSE,
  parent_id       UUID        REFERENCES notes(id) ON DELETE SET NULL,
  mentions        JSONB       NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Candidate-scoped note listing (candidate profile activity feed)
CREATE INDEX idx_notes_candidate
  ON notes(candidate_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Resource-scoped note listing (application detail, job detail sidebar)
CREATE INDEX idx_notes_resource
  ON notes(resource_type, resource_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Org-scoped filter for RLS and admin views
CREATE INDEX idx_notes_org
  ON notes(organization_id)
  WHERE deleted_at IS NULL;

-- Thread replies (expanding a note thread)
CREATE INDEX idx_notes_parent
  ON notes(parent_id)
  WHERE parent_id IS NOT NULL AND deleted_at IS NULL;

-- Author lookup (my notes filter, user activity audit)
CREATE INDEX idx_notes_author
  ON notes(author_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes FORCE ROW LEVEL SECURITY;

-- Private notes: only visible to the author or owner/admin
CREATE POLICY "notes_select" ON notes FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
    AND (
      is_private = FALSE
      OR author_id = auth.uid()
      OR has_org_role(organization_id, 'owner', 'admin')
    )
  );

CREATE POLICY "notes_insert" ON notes FOR INSERT
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = current_user_org_id()
    AND author_id = auth.uid()
  );

CREATE POLICY "notes_update" ON notes FOR UPDATE
  USING (
    organization_id = current_user_org_id()
    AND author_id = auth.uid()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "notes_delete" ON notes FOR DELETE
  USING (
    organization_id = current_user_org_id()
    AND (
      author_id = auth.uid()
      OR has_org_role(organization_id, 'owner', 'admin')
    )
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON notes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `email_templates`

Reusable email templates with merge-field support for automated and manual candidate communications.

```sql
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
```

### Indexes

```sql
-- Org-scoped template listing (email composer dropdown, settings page)
CREATE INDEX idx_email_templates_org
  ON email_templates(organization_id, category)
  WHERE deleted_at IS NULL;

-- System template lookup (seeded defaults that can't be deleted)
CREATE INDEX idx_email_templates_system
  ON email_templates(organization_id)
  WHERE is_system = TRUE AND deleted_at IS NULL;
```

### RLS

```sql
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
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `notification_preferences`

Per-user, per-event notification channel preferences. Controls whether a user receives in-app, email, both, or no notifications for each event type.

```sql
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
```

### Indexes

```sql
-- User's preferences lookup (notification settings page, dispatch logic)
CREATE INDEX idx_notification_prefs_user
  ON notification_preferences(user_id, event_type)
  WHERE deleted_at IS NULL;

-- Org-scoped lookup for admin management
CREATE INDEX idx_notification_prefs_org
  ON notification_preferences(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
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
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `files`

Immutable file metadata records linked to any entity. Actual file bytes live in Supabase Storage; this table tracks metadata, ownership, and antivirus scan status (ADR-009). Files are never updated — upload a new version instead.

```sql
CREATE TABLE files (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type       TEXT        NOT NULL
                                CHECK (entity_type IN ('candidate', 'job_opening', 'offer', 'application', 'organization')),
  entity_id         UUID        NOT NULL,
  file_category     TEXT        NOT NULL
                                CHECK (file_category IN ('resume', 'cover_letter', 'offer_letter', 'profile_photo', 'attachment', 'career_site_asset')),
  storage_path      TEXT        NOT NULL,
  original_filename TEXT        NOT NULL,
  mime_type         TEXT        NOT NULL,
  file_size_bytes   BIGINT      NOT NULL,
  scan_status       TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (scan_status IN ('pending', 'clean', 'infected')),
  uploaded_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Entity-scoped file listing (candidate resume tab, job attachments)
CREATE INDEX idx_files_entity
  ON files(entity_type, entity_id)
  WHERE deleted_at IS NULL;

-- Org-scoped lookup for RLS and storage quota calculations
CREATE INDEX idx_files_org
  ON files(organization_id)
  WHERE deleted_at IS NULL;

-- Pending scan queue (background ClamAV worker)
CREATE INDEX idx_files_scan_pending
  ON files(scan_status)
  WHERE scan_status = 'pending' AND deleted_at IS NULL;

-- Uploader lookup (user's uploaded files, audit)
CREATE INDEX idx_files_uploaded_by
  ON files(uploaded_by)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;

CREATE POLICY "files_select" ON files FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "files_insert" ON files FOR INSERT
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = current_user_org_id()
  );

-- No update policy: files are immutable. Upload a new version instead.
CREATE POLICY "files_update" ON files FOR UPDATE
  USING (FALSE);

CREATE POLICY "files_delete" ON files FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
-- No set_updated_at trigger: files have no updated_at column (immutable)

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON files
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `custom_field_definitions`

Organization-defined custom fields for candidates, job openings, and applications. Controls field type, ordering, and allowed values for select fields.

```sql
CREATE TABLE custom_field_definitions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type     TEXT        NOT NULL
                              CHECK (entity_type IN ('candidate', 'job_opening', 'application')),
  field_name      TEXT        NOT NULL,
  field_type      TEXT        NOT NULL
                              CHECK (field_type IN ('text', 'number', 'select', 'multi_select', 'date', 'url', 'boolean')),
  field_options   JSONB       NOT NULL DEFAULT '[]',
  is_required     BOOLEAN     NOT NULL DEFAULT FALSE,
  position        INTEGER     NOT NULL DEFAULT 0,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);

-- Case-insensitive uniqueness per org + entity type
CREATE UNIQUE INDEX idx_custom_field_defs_unique_name
  ON custom_field_definitions(organization_id, entity_type, lower(field_name))
  WHERE deleted_at IS NULL;
```

### Indexes

```sql
-- Org + entity type listing (custom field settings, form rendering)
CREATE INDEX idx_custom_field_defs_org_entity
  ON custom_field_definitions(organization_id, entity_type, position)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions FORCE ROW LEVEL SECURITY;

CREATE POLICY "custom_field_defs_select" ON custom_field_definitions FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "custom_field_defs_insert" ON custom_field_definitions FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "custom_field_defs_update" ON custom_field_definitions FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "custom_field_defs_delete" ON custom_field_definitions FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `custom_field_values`

Polymorphic values for custom fields. Each row stores a single field value for a specific entity. The `value` column is JSONB to accommodate all field types (see `CustomFieldValue` type in `lib/types/ground-truth.ts`).

```sql
CREATE TABLE custom_field_values (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  definition_id   UUID        NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  entity_type     TEXT        NOT NULL,
  entity_id       UUID        NOT NULL,
  value           JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (definition_id, entity_id)
);
```

### Indexes

```sql
-- Entity-scoped value lookup (rendering custom fields on a candidate/job/application)
CREATE INDEX idx_custom_field_values_entity
  ON custom_field_values(entity_type, entity_id)
  WHERE deleted_at IS NULL;

-- Definition-scoped lookup (bulk value retrieval for a field, e.g., filtering)
CREATE INDEX idx_custom_field_values_def
  ON custom_field_values(definition_id)
  WHERE deleted_at IS NULL;

-- Org-scoped lookup for RLS
CREATE INDEX idx_custom_field_values_org
  ON custom_field_values(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_values FORCE ROW LEVEL SECURITY;

CREATE POLICY "custom_field_values_select" ON custom_field_values FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "custom_field_values_insert" ON custom_field_values FOR INSERT
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "custom_field_values_update" ON custom_field_values FOR UPDATE
  USING (
    is_org_member(organization_id)
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "custom_field_values_delete" ON custom_field_values FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON custom_field_values
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON custom_field_values
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```
