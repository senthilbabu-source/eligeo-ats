-- Migration 015: AI Infrastructure
-- Phase 2.6: Command Bar + AI Core (ADR-011)
-- Enables: pgvector embeddings, AI usage tracking, credit consumption
-- Dependencies: 00001 (extensions), 00002 (organizations), 00008 (job_openings), 00009 (candidates)

-- ─── pgvector extension ──────────────────────────────────
-- Previously deferred to v2.0; moved to Phase 2.6 per ADR-011
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─── Embedding columns ───────────────────────────────────
-- text-embedding-3-small = 1536 dimensions
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS candidate_embedding vector(1536);

ALTER TABLE job_openings
  ADD COLUMN IF NOT EXISTS job_embedding vector(1536);

-- HNSW indexes per ADR-003: m=16, ef_construction=64
-- Cosine distance operator: <=>
CREATE INDEX IF NOT EXISTS idx_candidates_embedding_hnsw
  ON candidates USING hnsw (candidate_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_job_openings_embedding_hnsw
  ON job_openings USING hnsw (job_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── ai_usage_logs ───────────────────────────────────────
-- Tracks every AI operation for billing, audit, and debugging.
-- Append-only. No soft delete (like audit_logs per ADR-006).
CREATE TABLE ai_usage_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL
                              CHECK (action IN (
                                'resume_parse', 'candidate_match', 'job_description_generate',
                                'email_draft', 'feedback_summarize', 'nl_intent', 'bias_check'
                              )),
  entity_type     TEXT,       -- 'candidate', 'job_opening', 'application', etc.
  entity_id       UUID,       -- ID of the entity being acted on
  credits_used    INTEGER     NOT NULL DEFAULT 1,
  model           TEXT,       -- 'text-embedding-3-small', 'gpt-4o-mini', etc.
  tokens_input    INTEGER,    -- Input tokens consumed
  tokens_output   INTEGER,    -- Output tokens consumed
  latency_ms      INTEGER,    -- Round-trip time to OpenAI
  status          TEXT        NOT NULL DEFAULT 'success'
                              CHECK (status IN ('success', 'error', 'skipped')),
  error_message   TEXT,       -- Error details if status = 'error'
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_org_created
  ON ai_usage_logs (organization_id, created_at DESC);

CREATE INDEX idx_ai_usage_action
  ON ai_usage_logs (action, created_at DESC);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs FORCE ROW LEVEL SECURITY;

-- Only org members can view their own AI usage
CREATE POLICY "ai_usage_select" ON ai_usage_logs FOR SELECT
  USING (is_org_member(organization_id));

-- Insert via service role only (background jobs)
CREATE POLICY "ai_usage_insert" ON ai_usage_logs FOR INSERT
  WITH CHECK (FALSE); -- Service role bypasses RLS

-- Append-only: no updates or deletes
CREATE POLICY "ai_usage_update" ON ai_usage_logs FOR UPDATE
  USING (FALSE);

CREATE POLICY "ai_usage_delete" ON ai_usage_logs FOR DELETE
  USING (FALSE);

-- ─── consume_ai_credits() ────────────────────────────────
-- Atomic credit consumption. Returns new total or NULL if insufficient.
CREATE OR REPLACE FUNCTION consume_ai_credits(
  p_org_id UUID,
  p_amount INTEGER DEFAULT 1
) RETURNS INTEGER AS $$
  UPDATE organizations
  SET ai_credits_used = ai_credits_used + p_amount
  WHERE id = p_org_id
    AND ai_credits_used + p_amount <= ai_credits_limit
  RETURNING ai_credits_used;
$$ LANGUAGE sql;

-- ─── match_candidates_for_job() ──────────────────────────
-- Returns top N candidates by cosine similarity for a given job.
-- Respects org isolation. Excludes soft-deleted and non-embedded.
CREATE OR REPLACE FUNCTION match_candidates_for_job(
  p_job_id UUID,
  p_organization_id UUID,
  p_similarity_threshold FLOAT DEFAULT 0.5,
  p_max_results INTEGER DEFAULT 50
) RETURNS TABLE (
  candidate_id UUID,
  full_name TEXT,
  email TEXT,
  current_title TEXT,
  skills TEXT[],
  similarity_score FLOAT
) AS $$
  SELECT
    c.id AS candidate_id,
    c.full_name,
    c.email,
    c.current_title,
    c.skills,
    1 - (c.candidate_embedding <=> j.job_embedding) AS similarity_score
  FROM candidates c
  CROSS JOIN job_openings j
  WHERE j.id = p_job_id
    AND j.organization_id = p_organization_id
    AND c.organization_id = p_organization_id
    AND c.candidate_embedding IS NOT NULL
    AND j.job_embedding IS NOT NULL
    AND c.deleted_at IS NULL
    AND j.deleted_at IS NULL
    AND 1 - (c.candidate_embedding <=> j.job_embedding) >= p_similarity_threshold
  ORDER BY c.candidate_embedding <=> j.job_embedding ASC
  LIMIT p_max_results;
$$ LANGUAGE sql STABLE;
