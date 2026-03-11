# D08 — System, Compliance & Integrations

> Sub-document of [DATABASE-SCHEMA.md](../DATABASE-SCHEMA.md)
> Tables: `audit_logs`, `ai_usage_logs`, `api_keys`, `webhook_endpoints`, `nylas_grants`, `candidate_dei_data`, `candidate_encryption_keys`, `gdpr_erasure_log`

---

## `audit_logs`

Append-only audit trail capturing every mutation across all tables (ADR-007). Partitioned by month for query performance and retention management. No `deleted_at` or `updated_at` — this table is immutable. No audit trigger on itself.

```sql
-- Partitioned table definition
CREATE TABLE audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  table_name    TEXT        NOT NULL,
  record_id     UUID,
  action        TEXT        NOT NULL
                            CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data      JSONB,
  new_data      JSONB,
  performed_by  UUID,
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (performed_at);

-- Create initial partitions (monthly)
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
-- Additional partitions created by a monthly Inngest cron job
```

### Indexes

```sql
-- Record-scoped history (viewing audit trail for a specific entity)
CREATE INDEX idx_audit_logs_record
  ON audit_logs(table_name, record_id, performed_at DESC);

-- Org-scoped audit log listing (compliance dashboard)
CREATE INDEX idx_audit_logs_org
  ON audit_logs(organization_id, performed_at DESC);

-- User activity audit (who did what)
CREATE INDEX idx_audit_logs_performer
  ON audit_logs(performed_by, performed_at DESC);
```

### RLS

```sql
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  USING (
    has_org_role(organization_id, 'owner', 'admin')
  );

CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT
  WITH CHECK (TRUE);  -- Written by audit_trigger_func() via SECURITY DEFINER

CREATE POLICY "audit_logs_update" ON audit_logs FOR UPDATE
  USING (FALSE);  -- Append-only: no updates allowed

CREATE POLICY "audit_logs_delete" ON audit_logs FOR DELETE
  USING (FALSE);  -- Append-only: no deletes allowed
```

### Triggers

```sql
-- No set_updated_at trigger: audit_logs has no updated_at column
-- No audit_trigger: audit_logs does not audit itself
```

---

## `ai_usage_logs`

Tracks AI feature usage for billing, cost monitoring, and rate limiting. Append-only for billing integrity but includes `deleted_at` for consistency with the broader schema.

```sql
CREATE TABLE ai_usage_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL
                              CHECK (action IN ('resume_parse', 'candidate_match', 'job_description_generate', 'email_draft', 'feedback_summarize', 'daily_briefing')),
                              -- 'daily_briefing' added in Migration 021 (Wave 3 dashboard briefing)
  model           TEXT        NOT NULL,
  input_tokens    INTEGER     NOT NULL DEFAULT 0,
  output_tokens   INTEGER     NOT NULL DEFAULT 0,
  cost_cents      INTEGER     NOT NULL DEFAULT 0,
  entity_type     TEXT,
  entity_id       UUID,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Org-scoped usage listing (AI usage dashboard, billing summary)
CREATE INDEX idx_ai_usage_org
  ON ai_usage_logs(organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- User-scoped usage (per-user AI credit tracking)
CREATE INDEX idx_ai_usage_user
  ON ai_usage_logs(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Action-type aggregation (cost breakdown by feature)
CREATE INDEX idx_ai_usage_action
  ON ai_usage_logs(organization_id, action)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_logs_select" ON ai_usage_logs FOR SELECT
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND deleted_at IS NULL
  );

CREATE POLICY "ai_usage_logs_insert" ON ai_usage_logs FOR INSERT
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "ai_usage_logs_update" ON ai_usage_logs FOR UPDATE
  USING (FALSE);  -- Append-only: no updates allowed

CREATE POLICY "ai_usage_logs_delete" ON ai_usage_logs FOR DELETE
  USING (FALSE);  -- Append-only: no deletes allowed
```

### Triggers

```sql
-- No set_updated_at trigger: ai_usage_logs has no updated_at column

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON ai_usage_logs
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `org_daily_briefings`

> **Added:** Migration 021 (Wave 3 dashboard enhancements)

Caches the AI-generated daily briefing per org per calendar day. One row per `(org_id, date)`. Cache-first: `analytics/generate-briefing` checks this table before calling OpenAI. SELECT is open to all org members; INSERT/UPDATE/DELETE is service-role-only.

No `deleted_at` — rows expire naturally (old dates are irrelevant). Retention: rows older than 90 days can be purged by the compliance retention cron.

```sql
CREATE TABLE org_daily_briefings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date            DATE        NOT NULL,
  bullets         JSONB       NOT NULL,
  -- Shape: { "win": string, "blocker": string, "action": string }
  -- Generated by OpenAI structured output in analytics/generate-briefing
  model           TEXT        NOT NULL,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, date)
);
```

### Indexes

```sql
CREATE INDEX idx_org_daily_briefings_org_date
  ON org_daily_briefings(org_id, date DESC);
```

### RLS

```sql
ALTER TABLE org_daily_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_daily_briefings FORCE ROW LEVEL SECURITY;

-- All org members can read their org's briefings
CREATE POLICY "org_daily_briefings_select" ON org_daily_briefings FOR SELECT
  USING (is_org_member(org_id));

-- Service role only: INSERT via analytics/generate-briefing Inngest function
CREATE POLICY "org_daily_briefings_insert" ON org_daily_briefings FOR INSERT
  WITH CHECK (FALSE);

-- No updates: upsert is handled via ON CONFLICT DO UPDATE in service role context
CREATE POLICY "org_daily_briefings_update" ON org_daily_briefings FOR UPDATE
  USING (FALSE);

-- No user-facing deletes (admin regen deletes today's row via service role)
CREATE POLICY "org_daily_briefings_delete" ON org_daily_briefings FOR DELETE
  USING (FALSE);
```

---

## `api_keys`

Hashed API keys for external integrations. The plaintext key is shown once at creation and never stored. Only the SHA-256 hash and an 8-character prefix are persisted.

```sql
CREATE TABLE api_keys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  key_hash        TEXT        NOT NULL,
  key_prefix      TEXT        NOT NULL,
  permissions     JSONB       NOT NULL DEFAULT '{}',
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Key hash lookup for authentication (API middleware)
CREATE UNIQUE INDEX idx_api_keys_hash
  ON api_keys(key_hash)
  WHERE deleted_at IS NULL;

-- Org-scoped key listing (API settings page)
CREATE INDEX idx_api_keys_org
  ON api_keys(organization_id)
  WHERE deleted_at IS NULL;

-- Prefix lookup for key identification in logs
CREATE INDEX idx_api_keys_prefix
  ON api_keys(key_prefix)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_select" ON api_keys FOR SELECT
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND deleted_at IS NULL
  );

CREATE POLICY "api_keys_insert" ON api_keys FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "api_keys_update" ON api_keys FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "api_keys_delete" ON api_keys FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `webhook_endpoints`

Outgoing webhook subscriptions for real-time event delivery to external systems. Each endpoint subscribes to specific events and tracks delivery health via failure counts.

```sql
CREATE TABLE webhook_endpoints (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  url              TEXT        NOT NULL,
  secret           TEXT        NOT NULL,
  events           TEXT[]      NOT NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  last_status_code INTEGER,
  failure_count    INTEGER     NOT NULL DEFAULT 0,
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Org-scoped webhook listing (webhook settings page)
CREATE INDEX idx_webhook_endpoints_org
  ON webhook_endpoints(organization_id)
  WHERE deleted_at IS NULL;

-- Active webhook dispatch (event fan-out query)
CREATE INDEX idx_webhook_endpoints_active
  ON webhook_endpoints(organization_id)
  WHERE is_active = TRUE AND deleted_at IS NULL;

-- Unhealthy webhooks (admin monitoring, auto-disable logic)
CREATE INDEX idx_webhook_endpoints_failures
  ON webhook_endpoints(failure_count)
  WHERE failure_count > 0 AND is_active = TRUE AND deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY;

CREATE POLICY "webhook_endpoints_select" ON webhook_endpoints FOR SELECT
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND deleted_at IS NULL
  );

CREATE POLICY "webhook_endpoints_insert" ON webhook_endpoints FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "webhook_endpoints_update" ON webhook_endpoints FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "webhook_endpoints_delete" ON webhook_endpoints FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `nylas_grants`

OAuth grant records for Nylas email/calendar integration. One grant per user per organization. The `grant_id` is the Nylas-issued identifier; encryption is handled at the Supabase column-level.

```sql
CREATE TABLE nylas_grants (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grant_id        TEXT        NOT NULL,
  email           TEXT        NOT NULL,
  provider        TEXT        NOT NULL
                              CHECK (provider IN ('google', 'microsoft')),
  scopes          TEXT[]      NOT NULL,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (organization_id, user_id)
);
```

### Indexes

```sql
-- User grant lookup (email sync, calendar integration)
CREATE INDEX idx_nylas_grants_user
  ON nylas_grants(user_id)
  WHERE deleted_at IS NULL;

-- Org-scoped listing (admin integration settings)
CREATE INDEX idx_nylas_grants_org
  ON nylas_grants(organization_id)
  WHERE deleted_at IS NULL;

-- Nylas grant_id lookup (webhook callback resolution)
CREATE UNIQUE INDEX idx_nylas_grants_grant_id
  ON nylas_grants(grant_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE nylas_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE nylas_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY "nylas_grants_select" ON nylas_grants FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
    AND (
      user_id = auth.uid()
      OR has_org_role(organization_id, 'owner', 'admin')
    )
  );

CREATE POLICY "nylas_grants_insert" ON nylas_grants FOR INSERT
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = current_user_org_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "nylas_grants_update" ON nylas_grants FOR UPDATE
  USING (
    organization_id = current_user_org_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "nylas_grants_delete" ON nylas_grants FOR DELETE
  USING (
    organization_id = current_user_org_id()
    AND (
      user_id = auth.uid()
      OR has_org_role(organization_id, 'owner', 'admin')
    )
  );
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON nylas_grants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON nylas_grants
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `candidate_dei_data`

Self-reported diversity, equity, and inclusion data collected from candidates. This data is strictly walled off from hiring decisions — only organization owners and admins can access it (ADR-010). One record per candidate per organization.

```sql
CREATE TABLE candidate_dei_data (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  candidate_id    UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  data            JSONB       NOT NULL DEFAULT '{}',
  collected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  UNIQUE (organization_id, candidate_id)
);
```

### Indexes

```sql
-- Candidate-scoped lookup (DEI data retrieval for compliance reporting)
CREATE UNIQUE INDEX idx_dei_data_candidate
  ON candidate_dei_data(organization_id, candidate_id)
  WHERE deleted_at IS NULL;

-- Org-scoped listing (aggregate DEI reporting dashboard)
CREATE INDEX idx_dei_data_org
  ON candidate_dei_data(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

```sql
ALTER TABLE candidate_dei_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_dei_data FORCE ROW LEVEL SECURITY;

-- RESTRICTED: Only owner/admin can view DEI data (walled off from hiring decisions)
CREATE POLICY "dei_data_select" ON candidate_dei_data FOR SELECT
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND deleted_at IS NULL
  );

CREATE POLICY "dei_data_insert" ON candidate_dei_data FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "dei_data_update" ON candidate_dei_data FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "dei_data_delete" ON candidate_dei_data FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
-- No set_updated_at trigger: candidate_dei_data has no updated_at column

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON candidate_dei_data
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `candidate_encryption_keys`

Per-candidate encryption keys for crypto-shredding support (ADR-010). When a candidate is erased via GDPR/DSAR, deleting the encryption key renders their audit log entries unreadable. No `deleted_at` — deletion of this row IS the crypto-shred operation. No `updated_at` — keys are write-once.

```sql
CREATE TABLE candidate_encryption_keys (
  candidate_id    UUID        PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  encryption_key  BYTEA       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Indexes

```sql
-- Org-scoped lookup (key management, bulk erasure operations)
CREATE INDEX idx_encryption_keys_org
  ON candidate_encryption_keys(organization_id);
```

### RLS

```sql
ALTER TABLE candidate_encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_encryption_keys FORCE ROW LEVEL SECURITY;

-- Highly restricted: only owner/admin can access encryption keys
CREATE POLICY "encryption_keys_select" ON candidate_encryption_keys FOR SELECT
  USING (
    has_org_role(organization_id, 'owner', 'admin')
  );

CREATE POLICY "encryption_keys_insert" ON candidate_encryption_keys FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );

CREATE POLICY "encryption_keys_update" ON candidate_encryption_keys FOR UPDATE
  USING (FALSE);  -- Keys are write-once, never updated

CREATE POLICY "encryption_keys_delete" ON candidate_encryption_keys FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );
```

### Triggers

```sql
-- No set_updated_at trigger: candidate_encryption_keys has no updated_at column

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON candidate_encryption_keys
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `gdpr_erasure_log`

Append-only log recording every candidate data erasure event for regulatory compliance (ADR-010). No `deleted_at` or `updated_at` — this table is immutable. No audit trigger.

```sql
CREATE TABLE gdpr_erasure_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  candidate_id    UUID        NOT NULL,
  erased_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason          TEXT        NOT NULL
                              CHECK (reason IN ('dsar_request', 'retention_expiry', 'manual')),
  performed_by    UUID
);
```

### Indexes

```sql
-- Org-scoped erasure log listing (compliance audit trail)
CREATE INDEX idx_gdpr_erasure_org
  ON gdpr_erasure_log(organization_id, erased_at DESC);

-- Candidate erasure lookup (verify a candidate was erased)
CREATE INDEX idx_gdpr_erasure_candidate
  ON gdpr_erasure_log(candidate_id);
```

### RLS

```sql
ALTER TABLE gdpr_erasure_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_erasure_log FORCE ROW LEVEL SECURITY;

CREATE POLICY "gdpr_erasure_select" ON gdpr_erasure_log FOR SELECT
  USING (
    has_org_role(organization_id, 'owner', 'admin')
  );

CREATE POLICY "gdpr_erasure_insert" ON gdpr_erasure_log FOR INSERT
  WITH CHECK (TRUE);  -- Written by erase_candidate() via SECURITY DEFINER

CREATE POLICY "gdpr_erasure_update" ON gdpr_erasure_log FOR UPDATE
  USING (FALSE);  -- Append-only: no updates allowed

CREATE POLICY "gdpr_erasure_delete" ON gdpr_erasure_log FOR DELETE
  USING (FALSE);  -- Append-only: no deletes allowed
```

### Triggers

```sql
-- No set_updated_at trigger: gdpr_erasure_log has no updated_at column
-- No audit_trigger: gdpr_erasure_log does not audit itself
```
