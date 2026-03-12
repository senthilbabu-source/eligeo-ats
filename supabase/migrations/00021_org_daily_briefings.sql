-- Migration 021: org_daily_briefings — daily AI briefing cache per org
-- Phase: Dashboard Wave 3 (R11)
-- Dependencies: 002 (organizations), 002 (user_profiles), 015 (ai_usage_logs)

-- ─── org_daily_briefings ──────────────────────────────────
-- One row per org per day. Caches the AI briefing to avoid repeated OpenAI calls.
-- Cache-first: Inngest function checks for today's row before calling OpenAI.
CREATE TABLE org_daily_briefings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  briefing_date     DATE        NOT NULL,
  content           JSONB       NOT NULL,       -- {win: string, blocker: string, action: string}
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by      UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  model             TEXT        NOT NULL,
  prompt_tokens     INT,
  completion_tokens INT,
  deleted_at        TIMESTAMPTZ,
  UNIQUE(organization_id, briefing_date)
);

CREATE INDEX idx_org_daily_briefings_org_date
  ON org_daily_briefings(organization_id, briefing_date DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE org_daily_briefings ENABLE ROW LEVEL SECURITY;

-- SELECT: any active org member can read their org's briefings
CREATE POLICY "briefings_select" ON org_daily_briefings FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);

-- INSERT: admin/owner only (Inngest uses service role which bypasses RLS;
--         manual trigger via Server Action requires admin role)
CREATE POLICY "briefings_insert" ON org_daily_briefings FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );

-- UPDATE: admin/owner only (for cache regeneration)
CREATE POLICY "briefings_update" ON org_daily_briefings FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  )
  WITH CHECK (organization_id = current_user_org_id());

-- DELETE: admin/owner only (soft delete preferred — use deleted_at)
CREATE POLICY "briefings_delete" ON org_daily_briefings FOR DELETE
  USING (
    has_org_role(organization_id, 'owner', 'admin')
    AND organization_id = current_user_org_id()
  );

-- ─── ai_usage_logs: add 'daily_briefing' to action CHECK ──
-- Drop the auto-named inline CHECK, add updated constraint with new value.
ALTER TABLE ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_action_check;

ALTER TABLE ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_action_check
  CHECK (action IN (
    'resume_parse', 'candidate_match', 'job_description_generate',
    'email_draft', 'feedback_summarize', 'nl_intent', 'bias_check',
    'daily_briefing'
  ));
