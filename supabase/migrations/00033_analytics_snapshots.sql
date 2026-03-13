-- Migration 033: Analytics Snapshots
-- Phase 7 Wave A1 — Pre-computed daily analytics for the /analytics module.
-- One row per (org, date, type). Recomputed nightly by Inngest cron.

-- ── Table ────────────────────────────────────────────────────

CREATE TABLE analytics_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  snapshot_date     DATE NOT NULL,
  snapshot_type     TEXT NOT NULL
                    CHECK (snapshot_type IN (
                      'funnel_daily',
                      'velocity_daily',
                      'source_daily',
                      'team_daily',
                      'job_daily'
                    )),
  data              JSONB NOT NULL DEFAULT '{}',
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- ── Indexes ──────────────────────────────────────────────────

-- Unique: one snapshot per org/date/type (idempotent upsert target)
CREATE UNIQUE INDEX idx_analytics_snapshots_unique
  ON analytics_snapshots(organization_id, snapshot_date, snapshot_type)
  WHERE deleted_at IS NULL;

-- Lookup: most recent snapshots for an org
CREATE INDEX idx_analytics_snapshots_org_date
  ON analytics_snapshots(organization_id, snapshot_date DESC)
  WHERE deleted_at IS NULL;

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- Org members can read their own org's snapshots
CREATE POLICY "org_members_read_snapshots"
  ON analytics_snapshots FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

-- Service role inserts (Inngest nightly cron) — no user INSERT policy
-- Service role bypasses RLS entirely, so no explicit policy needed for it.
-- Authenticated users are blocked because there is no INSERT policy for them.

-- Service role updates (upsert on conflict) — no user UPDATE policy
-- Same pattern: service role bypasses RLS, users have no UPDATE policy.

-- ── Audit Trigger (ADR-007) ──────────────────────────────────

CREATE TRIGGER audit_analytics_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON analytics_snapshots
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
