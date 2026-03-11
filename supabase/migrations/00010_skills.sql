-- Migration 010: Skills (skills, candidate_skills, job_required_skills)
-- Phase 2: Jobs + Career Portal
-- Dependencies: 00002 (organizations), 00008 (job_openings), 00009 (candidates)

-- ─── skills ────────────────────────────────────────────────

CREATE TABLE skills (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id) ON DELETE RESTRICT,  -- NULL = global/system skill
  name            TEXT        NOT NULL,
  category        TEXT        CHECK (category IN ('programming', 'framework', 'database', 'devops', 'soft_skill', 'certification', 'language', 'domain', 'tool', 'other')),
  parent_id       UUID        REFERENCES skills(id) ON DELETE SET NULL,
  is_system       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);

-- Org-specific skill dedup (case-insensitive)
CREATE UNIQUE INDEX idx_skills_org_name
  ON skills(organization_id, lower(name))
  WHERE deleted_at IS NULL AND organization_id IS NOT NULL;

-- Global skill dedup
CREATE UNIQUE INDEX idx_skills_global_name
  ON skills(lower(name))
  WHERE organization_id IS NULL AND deleted_at IS NULL;

CREATE INDEX idx_skills_org
  ON skills(organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_skills_category
  ON skills(category)
  WHERE deleted_at IS NULL;

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills FORCE ROW LEVEL SECURITY;

-- Members can see their org's skills + global skills
CREATE POLICY "skills_select" ON skills FOR SELECT
  USING (
    deleted_at IS NULL
    AND (organization_id IS NULL OR is_org_member(organization_id))
  );

CREATE POLICY "skills_insert" ON skills FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "skills_update" ON skills FOR UPDATE
  USING (organization_id IS NOT NULL AND has_org_role(organization_id, 'owner', 'admin') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "skills_delete" ON skills FOR DELETE
  USING (organization_id IS NOT NULL AND has_org_role(organization_id, 'owner', 'admin') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_skills_audit
  AFTER INSERT OR UPDATE OR DELETE ON skills
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ─── candidate_skills ──────────────────────────────────────

CREATE TABLE candidate_skills (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  candidate_id     UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  skill_id         UUID        NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  proficiency      TEXT        CHECK (proficiency IN ('beginner', 'intermediate', 'advanced', 'expert')),
  source           TEXT        CHECK (source IN ('resume_parsed', 'self_reported', 'assessed')),
  years_experience INTEGER     CHECK (years_experience >= 0 AND years_experience <= 50),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (candidate_id, skill_id)
);

CREATE INDEX idx_candidate_skills_candidate
  ON candidate_skills(candidate_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_candidate_skills_skill
  ON candidate_skills(skill_id)
  WHERE deleted_at IS NULL;

ALTER TABLE candidate_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_skills FORCE ROW LEVEL SECURITY;

CREATE POLICY "candidate_skills_select" ON candidate_skills FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "candidate_skills_insert" ON candidate_skills FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "candidate_skills_update" ON candidate_skills FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "candidate_skills_delete" ON candidate_skills FOR DELETE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_candidate_skills_audit
  AFTER INSERT OR UPDATE OR DELETE ON candidate_skills
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ─── job_required_skills ───────────────────────────────────

CREATE TABLE job_required_skills (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  job_id          UUID        NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
  skill_id        UUID        NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  importance      TEXT        NOT NULL DEFAULT 'nice_to_have'
                              CHECK (importance IN ('must_have', 'nice_to_have')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (job_id, skill_id)
);

CREATE INDEX idx_job_skills_job
  ON job_required_skills(job_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_job_skills_must_have
  ON job_required_skills(job_id)
  WHERE deleted_at IS NULL AND importance = 'must_have';

ALTER TABLE job_required_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_required_skills FORCE ROW LEVEL SECURITY;

CREATE POLICY "job_skills_select" ON job_required_skills FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY "job_skills_insert" ON job_required_skills FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "job_skills_update" ON job_required_skills FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id())
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "job_skills_delete" ON job_required_skills FOR DELETE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id());

CREATE TRIGGER trg_job_skills_audit
  AFTER INSERT OR UPDATE OR DELETE ON job_required_skills
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
