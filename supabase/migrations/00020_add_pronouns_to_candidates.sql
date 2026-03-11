-- Migration 020: Add pronouns to candidates (CP7)
-- Stores candidate pronouns (e.g. "she/her", "he/him", "they/them") as freeform text.
-- Column is nullable; no enum — tenant values are freeform per ADR-008.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN candidates.pronouns IS 'Candidate pronouns (freeform, e.g. she/her, he/him, they/them)';
