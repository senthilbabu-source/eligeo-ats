-- Migration 007: Pipeline Tables (pipeline_templates, pipeline_stages)
-- Phase 2: Jobs + Career Portal
-- Dependencies: 00002 (organizations), 00006 (lookup tables)

-- ─── pipeline_templates ────────────────────────────────────

CREATE TABLE pipeline_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  description     TEXT,
  is_default      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (organization_id, name)
);

CREATE INDEX idx_pipeline_templates_org
  ON pipeline_templates(organization_id)
  WHERE deleted_at IS NULL;

-- Only one default per org
CREATE UNIQUE INDEX idx_pipeline_templates_default
  ON pipeline_templates(organization_id)
  WHERE is_default = TRUE AND deleted_at IS NULL;

ALTER TABLE pipeline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_templates_select" ON pipeline_templates FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "pipeline_templates_insert" ON pipeline_templates FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "pipeline_templates_update" ON pipeline_templates FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "pipeline_templates_delete" ON pipeline_templates FOR DELETE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_pipeline_templates_updated_at
  BEFORE UPDATE ON pipeline_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pipeline_templates_audit
  AFTER INSERT OR UPDATE OR DELETE ON pipeline_templates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ─── pipeline_stages ───────────────────────────────────────

CREATE TABLE pipeline_stages (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  pipeline_template_id UUID        NOT NULL REFERENCES pipeline_templates(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  stage_type           TEXT        NOT NULL
                                   CHECK (stage_type IN ('sourced', 'applied', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  stage_order          INTEGER     NOT NULL,
  is_terminal          BOOLEAN     NOT NULL DEFAULT FALSE,
  auto_actions         JSONB       NOT NULL DEFAULT '[]',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (pipeline_template_id, stage_order)
);

CREATE INDEX idx_pipeline_stages_template
  ON pipeline_stages(pipeline_template_id, stage_order)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_pipeline_stages_org
  ON pipeline_stages(organization_id)
  WHERE deleted_at IS NULL;

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages FORCE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_stages_select" ON pipeline_stages FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "pipeline_stages_insert" ON pipeline_stages FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "pipeline_stages_update" ON pipeline_stages FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "pipeline_stages_delete" ON pipeline_stages FOR DELETE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pipeline_stages_audit
  AFTER INSERT OR UPDATE OR DELETE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
