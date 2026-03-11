-- Migration 016: Fix idx_applications_candidate index collision
-- Phase 2.5 audit finding: Migration 014 tried to redefine idx_applications_candidate
-- with (candidate_id, applied_at DESC) but IF NOT EXISTS silently kept the original
-- single-column index from Migration 011. This creates the intended composite index
-- with a distinct name and drops the redundant single-column index.

-- Create the composite index (candidate detail page: applications sorted by date)
CREATE INDEX IF NOT EXISTS idx_applications_candidate_applied
  ON public.applications (candidate_id, applied_at DESC)
  WHERE deleted_at IS NULL;

-- Drop the single-column index (now redundant — composite covers candidate_id lookups)
DROP INDEX IF EXISTS idx_applications_candidate;
