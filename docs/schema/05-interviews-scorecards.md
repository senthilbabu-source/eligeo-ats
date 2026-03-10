# D05 — Interviews & Scorecards

> Sub-document of [DATABASE-SCHEMA.md](../DATABASE-SCHEMA.md)
> Tables: `interviews`, `scorecard_templates`, `scorecard_categories`, `scorecard_attributes`, `scorecard_submissions`, `scorecard_ratings`

---

## `interviews`

```sql
CREATE TABLE interviews (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  application_id        UUID        NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  job_id                UUID        NOT NULL REFERENCES job_openings(id) ON DELETE RESTRICT,
  interviewer_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  interview_type        TEXT        NOT NULL
                                    CHECK (interview_type IN (
                                      'phone_screen', 'technical', 'behavioral',
                                      'panel', 'culture_fit', 'final', 'other'
                                    )),
  scheduled_at          TIMESTAMPTZ,
  duration_minutes      INTEGER     NOT NULL DEFAULT 60,
  location              TEXT,
  meeting_url           TEXT,
  status                TEXT        NOT NULL DEFAULT 'scheduled'
                                    CHECK (status IN (
                                      'scheduled', 'confirmed', 'completed',
                                      'cancelled', 'no_show'
                                    )),
  scorecard_template_id UUID        REFERENCES scorecard_templates(id) ON DELETE SET NULL,
  feedback_deadline_at  TIMESTAMPTZ,
  nylas_event_id        TEXT,
  notes                 TEXT,
  created_by            UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Application interview list (interview tab on candidate profile)
CREATE INDEX idx_interviews_application_id ON interviews(application_id)
  WHERE deleted_at IS NULL;

-- Interviewer's upcoming schedule (My Interviews page)
CREATE INDEX idx_interviews_interviewer_schedule ON interviews(interviewer_id, scheduled_at)
  WHERE deleted_at IS NULL AND status IN ('scheduled', 'confirmed');

-- Org-scoped queries with status filter (admin dashboard)
CREATE INDEX idx_interviews_org_status ON interviews(organization_id, status)
  WHERE deleted_at IS NULL;

-- Job-level interview rollup
CREATE INDEX idx_interviews_job_id ON interviews(job_id)
  WHERE deleted_at IS NULL;

-- Nylas calendar sync reconciliation
CREATE UNIQUE INDEX idx_interviews_nylas_event ON interviews(nylas_event_id)
  WHERE nylas_event_id IS NOT NULL AND deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews FORCE ROW LEVEL SECURITY;

CREATE POLICY "interviews_select" ON interviews FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "interviews_insert" ON interviews FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
  );

CREATE POLICY "interviews_update" ON interviews FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
    OR interviewer_id = auth.uid()  -- Interviewers can update notes/status on their own interviews
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "interviews_delete" ON interviews FOR DELETE
  USING (FALSE);  -- Interviews are soft-deleted, never hard-deleted
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON interviews
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `scorecard_templates`

```sql
CREATE TABLE scorecard_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  description     TEXT,
  is_default      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Org-scoped template listing (template picker dropdown)
CREATE INDEX idx_scorecard_templates_org ON scorecard_templates(organization_id)
  WHERE deleted_at IS NULL;

-- Only one default template per org
CREATE UNIQUE INDEX idx_scorecard_templates_default ON scorecard_templates(organization_id)
  WHERE is_default = TRUE AND deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE scorecard_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY "scorecard_templates_select" ON scorecard_templates FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "scorecard_templates_insert" ON scorecard_templates FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
  );

CREATE POLICY "scorecard_templates_update" ON scorecard_templates FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager'))
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "scorecard_templates_delete" ON scorecard_templates FOR DELETE
  USING (FALSE);  -- Templates are soft-deleted, never hard-deleted
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON scorecard_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON scorecard_templates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `scorecard_categories`

Append-only structural rows within a template. No `updated_at` (reorder = delete + re-create).

```sql
CREATE TABLE scorecard_categories (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID        NOT NULL REFERENCES scorecard_templates(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,  -- e.g. "Technical Skills", "Communication"
  position        INTEGER     NOT NULL,
  weight          FLOAT       NOT NULL DEFAULT 1.0
                              CHECK (weight > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Categories for a given template, ordered by position
CREATE INDEX idx_scorecard_categories_template ON scorecard_categories(template_id, position)
  WHERE deleted_at IS NULL;

-- Org-scoped queries
CREATE INDEX idx_scorecard_categories_org ON scorecard_categories(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE scorecard_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_categories FORCE ROW LEVEL SECURITY;

CREATE POLICY "scorecard_categories_select" ON scorecard_categories FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "scorecard_categories_insert" ON scorecard_categories FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
  );

CREATE POLICY "scorecard_categories_update" ON scorecard_categories FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager'))
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "scorecard_categories_delete" ON scorecard_categories FOR DELETE
  USING (FALSE);  -- Categories are soft-deleted, never hard-deleted
```

### Triggers

```sql
-- No set_updated_at trigger (append-only table, no updated_at column)

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON scorecard_categories
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `scorecard_attributes`

Append-only scoring criteria within a category. No `updated_at` (reorder = delete + re-create).

```sql
CREATE TABLE scorecard_attributes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID        NOT NULL REFERENCES scorecard_categories(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,  -- e.g. "System Design", "Code Quality"
  description     TEXT,
  position        INTEGER     NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Attributes for a given category, ordered by position
CREATE INDEX idx_scorecard_attributes_category ON scorecard_attributes(category_id, position)
  WHERE deleted_at IS NULL;

-- Org-scoped queries
CREATE INDEX idx_scorecard_attributes_org ON scorecard_attributes(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE scorecard_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_attributes FORCE ROW LEVEL SECURITY;

CREATE POLICY "scorecard_attributes_select" ON scorecard_attributes FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "scorecard_attributes_insert" ON scorecard_attributes FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
  );

CREATE POLICY "scorecard_attributes_update" ON scorecard_attributes FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager'))
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "scorecard_attributes_delete" ON scorecard_attributes FOR DELETE
  USING (FALSE);  -- Attributes are soft-deleted, never hard-deleted
```

### Triggers

```sql
-- No set_updated_at trigger (append-only table, no updated_at column)

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON scorecard_attributes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `scorecard_submissions`

Interviewer feedback on a specific interview. Implements **blind review**: interviewers cannot see
other scorecards for the same application until they have submitted their own.

```sql
CREATE TABLE scorecard_submissions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  interview_id             UUID        NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
  application_id           UUID        NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  submitted_by             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  overall_recommendation   TEXT        NOT NULL
                                       CHECK (overall_recommendation IN (
                                         'strong_no', 'no', 'yes', 'strong_yes'
                                       )),
  overall_notes            TEXT,
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (interview_id, submitted_by)
);
```

### Indexes

```sql
-- Scorecards for an application (scorecard summary panel)
CREATE INDEX idx_scorecard_submissions_application ON scorecard_submissions(application_id)
  WHERE deleted_at IS NULL;

-- Scorecards for an interview (interview detail view)
CREATE INDEX idx_scorecard_submissions_interview ON scorecard_submissions(interview_id)
  WHERE deleted_at IS NULL;

-- User's own submissions (blind review self-check)
CREATE INDEX idx_scorecard_submissions_submitter ON scorecard_submissions(submitted_by, application_id)
  WHERE deleted_at IS NULL;

-- Org-scoped queries
CREATE INDEX idx_scorecard_submissions_org ON scorecard_submissions(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

Implements **blind review** per the RBAC matrix:
- Owner / admin / recruiter / hiring_manager can see all scorecards.
- Interviewers can always see their **own** scorecards.
- Interviewers can see **other** scorecards for the same application only **after** they have submitted their own.

```sql
ALTER TABLE scorecard_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_submissions FORCE ROW LEVEL SECURITY;

CREATE POLICY "scorecard_submissions_select" ON scorecard_submissions FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
    AND (
      -- Submitter can always see their own
      submitted_by = auth.uid()
      -- Privileged roles bypass blind review
      OR has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
      -- Blind review: interviewers see others only after submitting their own for this application
      OR EXISTS (
        SELECT 1 FROM scorecard_submissions ss
        WHERE ss.application_id = scorecard_submissions.application_id
          AND ss.submitted_by = auth.uid()
          AND ss.deleted_at IS NULL
      )
    )
  );

CREATE POLICY "scorecard_submissions_insert" ON scorecard_submissions FOR INSERT
  WITH CHECK (
    is_org_member(organization_id)
    AND submitted_by = auth.uid()  -- Can only submit as yourself
  );

CREATE POLICY "scorecard_submissions_update" ON scorecard_submissions FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      submitted_by = auth.uid()  -- Only the submitter can edit their own scorecard
      OR has_org_role(organization_id, 'owner', 'admin')  -- Owner/admin can correct any scorecard
    )
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "scorecard_submissions_delete" ON scorecard_submissions FOR DELETE
  USING (FALSE);  -- Scorecards are soft-deleted, never hard-deleted
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON scorecard_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON scorecard_submissions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `scorecard_ratings`

Individual attribute ratings within a scorecard submission. Append-only; corrections go through
the parent submission's update. No `updated_at`.

```sql
CREATE TABLE scorecard_ratings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID        NOT NULL REFERENCES scorecard_submissions(id) ON DELETE CASCADE,
  attribute_id    UUID        NOT NULL REFERENCES scorecard_attributes(id) ON DELETE RESTRICT,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  rating          INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (submission_id, attribute_id)
);
```

### Indexes

```sql
-- Ratings for a submission (scorecard detail view)
CREATE INDEX idx_scorecard_ratings_submission ON scorecard_ratings(submission_id)
  WHERE deleted_at IS NULL;

-- Ratings for an attribute across submissions (attribute analytics)
CREATE INDEX idx_scorecard_ratings_attribute ON scorecard_ratings(attribute_id)
  WHERE deleted_at IS NULL;

-- Org-scoped queries
CREATE INDEX idx_scorecard_ratings_org ON scorecard_ratings(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

Ratings inherit visibility from their parent `scorecard_submissions` row. The EXISTS sub-query
re-applies the same blind review logic.

```sql
ALTER TABLE scorecard_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_ratings FORCE ROW LEVEL SECURITY;

CREATE POLICY "scorecard_ratings_select" ON scorecard_ratings FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM scorecard_submissions ss
      WHERE ss.id = scorecard_ratings.submission_id
        AND ss.deleted_at IS NULL
        AND (
          ss.submitted_by = auth.uid()
          OR has_org_role(ss.organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
          OR EXISTS (
            SELECT 1 FROM scorecard_submissions own
            WHERE own.application_id = ss.application_id
              AND own.submitted_by = auth.uid()
              AND own.deleted_at IS NULL
          )
        )
    )
  );

CREATE POLICY "scorecard_ratings_insert" ON scorecard_ratings FOR INSERT
  WITH CHECK (
    is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM scorecard_submissions ss
      WHERE ss.id = scorecard_ratings.submission_id
        AND ss.submitted_by = auth.uid()  -- Can only add ratings to your own submission
    )
  );

CREATE POLICY "scorecard_ratings_update" ON scorecard_ratings FOR UPDATE
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM scorecard_submissions ss
      WHERE ss.id = scorecard_ratings.submission_id
        AND (
          ss.submitted_by = auth.uid()
          OR has_org_role(ss.organization_id, 'owner', 'admin')
        )
    )
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "scorecard_ratings_delete" ON scorecard_ratings FOR DELETE
  USING (FALSE);  -- Ratings are soft-deleted, never hard-deleted
```

### Triggers

```sql
-- No set_updated_at trigger (append-only table, no updated_at column)

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON scorecard_ratings
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```
