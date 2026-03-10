# D04 — Skills & Matching

> Sub-document of [DATABASE-SCHEMA.md](../DATABASE-SCHEMA.md)
> Tables: `skills`, `candidate_skills`, `job_required_skills`

---

## `skills`

Hierarchical skill taxonomy. Global skills have `organization_id = NULL`; org-specific skills are tenant-scoped. Supports parent-child relationships for skill grouping (e.g., "JavaScript" under "Programming Languages").

```sql
CREATE TABLE skills (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id) ON DELETE RESTRICT,  -- NULL for global/shared skills
  name            TEXT        NOT NULL,
  category        TEXT        CHECK (category IN ('programming', 'framework', 'database', 'devops', 'soft_skill', 'certification', 'language', 'domain', 'tool', 'other')),
  parent_id       UUID        REFERENCES skills(id) ON DELETE SET NULL,
  is_system       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);

-- Org-scoped dedup: prevents duplicate skill names within the same org (or within globals)
CREATE UNIQUE INDEX idx_skills_org_name
  ON skills(organization_id, lower(name))
  WHERE deleted_at IS NULL;

-- Global skills dedup (organization_id IS NULL)
CREATE UNIQUE INDEX idx_skills_global_name
  ON skills(lower(name))
  WHERE organization_id IS NULL AND deleted_at IS NULL;
```

### Indexes

```sql
-- Org-scoped skill listing (skill picker autocomplete)
CREATE INDEX idx_skills_org
  ON skills(organization_id)
  WHERE deleted_at IS NULL;

-- Category filtering (skill management page)
CREATE INDEX idx_skills_category
  ON skills(category)
  WHERE deleted_at IS NULL;

-- Hierarchy traversal (parent-child tree rendering)
CREATE INDEX idx_skills_parent
  ON skills(parent_id)
  WHERE deleted_at IS NULL AND parent_id IS NOT NULL;
```

### RLS

```sql
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills FORCE ROW LEVEL SECURITY;

-- Members can see their org's skills + global skills (organization_id IS NULL)
CREATE POLICY "skills_select" ON skills FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      organization_id IS NULL
      OR is_org_member(organization_id)
    )
  );

CREATE POLICY "skills_insert" ON skills FOR INSERT
  WITH CHECK (
    -- Global skills can only be created by system (service_role), not via RLS
    organization_id IS NOT NULL
    AND has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "skills_update" ON skills FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "skills_delete" ON skills FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
-- No updated_at column, so no set_updated_at trigger

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON skills
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `candidate_skills`

Links candidates to skills with proficiency and provenance metadata. Carries `organization_id` for RLS even though it could be derived from the candidate.

```sql
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
```

### Indexes

```sql
-- Candidate's skill profile (candidate detail page, matching engine)
CREATE INDEX idx_candidate_skills_candidate
  ON candidate_skills(candidate_id)
  WHERE deleted_at IS NULL;

-- Skill-based candidate search ("find all candidates with Python")
CREATE INDEX idx_candidate_skills_skill
  ON candidate_skills(skill_id)
  WHERE deleted_at IS NULL;

-- Org-scoped for RLS and analytics
CREATE INDEX idx_candidate_skills_org
  ON candidate_skills(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE candidate_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_skills FORCE ROW LEVEL SECURITY;

CREATE POLICY "candidate_skills_select" ON candidate_skills FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "candidate_skills_insert" ON candidate_skills FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "candidate_skills_update" ON candidate_skills FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "candidate_skills_delete" ON candidate_skills FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
-- No updated_at column, so no set_updated_at trigger

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON candidate_skills
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `job_required_skills`

Skills required or preferred for a job opening. Used by the matching engine to score candidates against job requirements.

```sql
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
```

### Indexes

```sql
-- Job's required skill listing (job detail page, matching engine)
CREATE INDEX idx_job_skills_job
  ON job_required_skills(job_id)
  WHERE deleted_at IS NULL;

-- Skill-based job search ("find jobs requiring Python")
CREATE INDEX idx_job_skills_skill
  ON job_required_skills(skill_id)
  WHERE deleted_at IS NULL;

-- Org-scoped for RLS and analytics
CREATE INDEX idx_job_skills_org
  ON job_required_skills(organization_id)
  WHERE deleted_at IS NULL;

-- Must-have skills for strict matching filter
CREATE INDEX idx_job_skills_must_have
  ON job_required_skills(job_id)
  WHERE deleted_at IS NULL AND importance = 'must_have';
```

### RLS

```sql
ALTER TABLE job_required_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_required_skills FORCE ROW LEVEL SECURITY;

CREATE POLICY "job_skills_select" ON job_required_skills FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "job_skills_insert" ON job_required_skills FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "job_skills_update" ON job_required_skills FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "job_skills_delete" ON job_required_skills FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
-- No updated_at column, so no set_updated_at trigger

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON job_required_skills
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```
