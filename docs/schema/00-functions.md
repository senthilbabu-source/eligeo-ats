# D01 — Extensions, Functions & Triggers

> Sub-document of [DATABASE-SCHEMA.md](../DATABASE-SCHEMA.md)

---

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector for AI embeddings
```

---

## RLS Helper Functions

### `current_user_org_id()`

Returns the authenticated user's active organization. Updated per ADR-005 to respect `last_active_org_id` for multi-org switching.

```sql
CREATE OR REPLACE FUNCTION current_user_org_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT om.organization_id
  FROM organization_members om
  WHERE om.user_id = auth.uid()
    AND om.is_active = TRUE
  ORDER BY (om.organization_id = om.last_active_org_id) DESC,
           om.joined_at ASC
  LIMIT 1;
$$;
```

### `is_org_member(org_id)`

Returns TRUE if the current user is an active member of the given organization.

```sql
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND is_active = TRUE
  );
$$;
```

### `has_org_role(org_id, ...roles)`

Returns TRUE if the current user has one of the specified roles in the given organization.

```sql
CREATE OR REPLACE FUNCTION has_org_role(org_id UUID, VARIADIC allowed_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role = ANY(allowed_roles)
      AND is_active = TRUE
  );
$$;
```

---

## JWT Custom Access Token Hook

Registered as a Supabase Auth Hook (not a Postgres trigger). Injects organization context into JWT claims. Updated per ADR-005 to prefer `last_active_org_id`.

```sql
CREATE OR REPLACE FUNCTION custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE
SECURITY DEFINER
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
```

---

## Trigger Functions

### `set_updated_at()`

Auto-updates `updated_at` on every row modification.

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Applied to every table that has an `updated_at` column:

```sql
-- Template (repeated per table):
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON {table_name}
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### `audit_trigger_func()`

Captures every mutation into `audit_logs`. Per ADR-007. Uses `COALESCE(auth.uid(), current_setting('app.performed_by'))` to support both API routes and background jobs.

```sql
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    organization_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    performed_by,
    performed_at
  ) VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    COALESCE(auth.uid(), current_setting('app.performed_by', true)::UUID),
    NOW()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Applied to every table except `audit_logs` and `gdpr_erasure_log`:

```sql
-- Template (repeated per table):
CREATE TRIGGER audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON {table_name}
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## AI Functions

### `match_candidates_for_job()`

Semantic candidate matching using pgvector HNSW index (ADR-003).

```sql
CREATE OR REPLACE FUNCTION match_candidates_for_job(
  query_embedding       vector(1536),
  match_organization_id UUID,
  similarity_threshold  FLOAT DEFAULT 0.6,
  match_count           INT   DEFAULT 50
)
RETURNS TABLE (id UUID, similarity FLOAT, skills TEXT[], full_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.id,
    1 - (c.candidate_embedding <=> query_embedding) AS similarity,
    c.skills,
    c.full_name
  FROM candidates c
  WHERE
    c.organization_id = match_organization_id
    AND c.deleted_at IS NULL
    AND c.is_anonymized = FALSE
    AND c.candidate_embedding IS NOT NULL
    AND 1 - (c.candidate_embedding <=> query_embedding) >= similarity_threshold
  ORDER BY c.candidate_embedding <=> query_embedding
  LIMIT match_count;
$$;
```

---

## GDPR Erasure Function

Per ADR-010. Crypto-shreds audit logs + anonymizes entity tables.

```sql
CREATE OR REPLACE FUNCTION erase_candidate(p_candidate_id UUID, p_org_id UUID)
RETURNS VOID AS $$
BEGIN
  -- 1. Anonymize candidate record
  UPDATE candidates SET
    full_name = 'REDACTED',
    email = 'redacted-' || id || '@erased.invalid',
    phone = NULL,
    current_title = NULL,
    current_company = NULL,
    location = NULL,
    linkedin_url = NULL,
    github_url = NULL,
    portfolio_url = NULL,
    resume_parsed = NULL,
    resume_text = NULL,
    resume_file_hash = NULL,
    candidate_embedding = NULL,
    source_details = '{}',
    is_anonymized = TRUE,
    updated_at = NOW()
  WHERE id = p_candidate_id AND organization_id = p_org_id;

  -- 2. Soft-delete applications
  UPDATE applications SET deleted_at = NOW()
  WHERE candidate_id = p_candidate_id AND organization_id = p_org_id AND deleted_at IS NULL;

  -- 3. Soft-delete notes
  UPDATE notes SET deleted_at = NOW()
  WHERE candidate_id = p_candidate_id AND organization_id = p_org_id AND deleted_at IS NULL;

  -- 4. Soft-delete scorecard submissions
  UPDATE scorecard_submissions SET deleted_at = NOW()
  WHERE application_id IN (
    SELECT id FROM applications WHERE candidate_id = p_candidate_id AND organization_id = p_org_id
  ) AND deleted_at IS NULL;

  -- 5. Soft-delete offers
  UPDATE offers SET deleted_at = NOW()
  WHERE application_id IN (
    SELECT id FROM applications WHERE candidate_id = p_candidate_id AND organization_id = p_org_id
  ) AND deleted_at IS NULL;

  -- 6. Soft-delete custom field values
  UPDATE custom_field_values SET deleted_at = NOW()
  WHERE entity_type = 'candidate' AND entity_id = p_candidate_id AND deleted_at IS NULL;

  -- 7. Soft-delete candidate skills and talent pool memberships
  UPDATE candidate_skills SET deleted_at = NOW()
  WHERE candidate_id = p_candidate_id AND deleted_at IS NULL;

  UPDATE talent_pool_members SET deleted_at = NOW()
  WHERE candidate_id = p_candidate_id AND deleted_at IS NULL;

  -- 8. Soft-delete files metadata
  UPDATE files SET deleted_at = NOW()
  WHERE entity_type = 'candidate' AND entity_id = p_candidate_id
    AND organization_id = p_org_id AND deleted_at IS NULL;

  -- 9. Crypto-shred audit logs
  DELETE FROM candidate_encryption_keys
  WHERE candidate_id = p_candidate_id AND organization_id = p_org_id;

  -- 10. Log erasure
  INSERT INTO gdpr_erasure_log (organization_id, candidate_id, erased_at, reason, performed_by)
  VALUES (p_org_id, p_candidate_id, NOW(), 'dsar_request',
    COALESCE(auth.uid(), current_setting('app.performed_by', true)::UUID));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

*All functions above are created in the `public` schema. The `custom_access_token_hook` is additionally registered in Supabase Dashboard → Authentication → Hooks.*
