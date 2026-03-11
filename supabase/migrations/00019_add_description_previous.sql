-- Migration 019: Add description_previous for non-destructive AI rewrites
-- Phase: 2.7 / J3 P0 bug fix
-- Dependency: 00008 (job_openings)
--
-- Stores the original description before any AI rewrite so the recruiter
-- can revert if the AI output is worse. Nullable — NULL means no rewrite
-- has been applied yet.

ALTER TABLE job_openings ADD COLUMN description_previous TEXT;
