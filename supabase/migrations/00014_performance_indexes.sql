-- Migration 014: Performance indexes for pagination and filtered queries
-- Phase 2.5 — prevents full-table scans on list pages

-- Jobs: paginated list sorted by created_at within org
CREATE INDEX IF NOT EXISTS idx_job_openings_org_created
  ON public.job_openings (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Jobs: career portal queries (open jobs sorted by published_at)
CREATE INDEX IF NOT EXISTS idx_job_openings_status_published
  ON public.job_openings (status, published_at DESC)
  WHERE deleted_at IS NULL;

-- Candidates: paginated list sorted by created_at within org
CREATE INDEX IF NOT EXISTS idx_candidates_org_created
  ON public.candidates (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Applications: paginated list sorted by applied_at within org
CREATE INDEX IF NOT EXISTS idx_applications_org_applied
  ON public.applications (organization_id, applied_at DESC)
  WHERE deleted_at IS NULL;

-- Applications: lookup by candidate (candidate detail page)
CREATE INDEX IF NOT EXISTS idx_applications_candidate
  ON public.applications (candidate_id, applied_at DESC)
  WHERE deleted_at IS NULL;

-- Career portal: job lookup by slug (single job detail)
CREATE INDEX IF NOT EXISTS idx_job_openings_slug_status
  ON public.job_openings (slug, status)
  WHERE deleted_at IS NULL;
