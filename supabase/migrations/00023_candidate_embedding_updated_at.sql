-- Migration 023: Add embedding_updated_at to candidates
-- Mirrors the same column on job_openings (migration 022).
-- Enables the staleness badge (Wave D/D3 — AF2) for candidate embeddings.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;
