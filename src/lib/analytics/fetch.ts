/**
 * Analytics data fetching — shared helpers for API routes and Inngest.
 * Fetches raw data from Supabase for a given org and date range.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  RawApplication,
  RawStageHistoryRow,
  RawStage,
  RawJob,
  RawCandidate,
  RawCandidateSource,
  RawInterview,
  RawScorecardSubmission,
  RawUserProfile,
  RawOffer,
  DateRange,
} from "./compute";

export type AnalyticsRawData = {
  applications: RawApplication[];
  stageHistory: RawStageHistoryRow[];
  stages: RawStage[];
  jobs: RawJob[];
  candidates: RawCandidate[];
  sources: RawCandidateSource[];
  interviews: RawInterview[];
  scorecards: RawScorecardSubmission[];
  profiles: RawUserProfile[];
  offers: RawOffer[];
};

export async function fetchAnalyticsRawData(
  orgId: string,
  _dateRange?: DateRange
): Promise<AnalyticsRawData> {
  const supabase = await createClient();

  const [
    { data: applications },
    { data: stageHistory },
    { data: stages },
    { data: jobs },
    { data: candidates },
    { data: sources },
    { data: interviews },
    { data: scorecards },
    { data: profiles },
    { data: offers },
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("id, job_opening_id, candidate_id, status, current_stage_id, applied_at, hired_at, rejected_at, withdrawn_at")
      .eq("organization_id", orgId)
      .is("deleted_at", null),
    supabase
      .from("application_stage_history")
      .select("id, application_id, from_stage_id, to_stage_id, created_at")
      .eq("organization_id", orgId)
      .is("deleted_at", null),
    supabase
      .from("pipeline_stages")
      .select("id, name, stage_type, stage_order, pipeline_template_id")
      .is("deleted_at", null),
    supabase
      .from("job_openings")
      .select("id, title, department, status, recruiter_id, published_at, created_at")
      .eq("organization_id", orgId)
      .is("deleted_at", null),
    supabase
      .from("candidates")
      .select("id, source, source_id")
      .eq("organization_id", orgId)
      .is("deleted_at", null),
    supabase
      .from("candidate_sources")
      .select("id, name")
      .eq("organization_id", orgId)
      .is("deleted_at", null),
    supabase
      .from("interviews")
      .select("id, application_id, job_opening_id, interviewer_id, status, scheduled_at, completed_at, created_at")
      .eq("organization_id", orgId)
      .is("deleted_at", null),
    supabase
      .from("scorecard_submissions")
      .select("id, interview_id, application_id, submitted_by, created_at")
      .eq("organization_id", orgId)
      .is("deleted_at", null),
    supabase
      .from("user_profiles")
      .select("id, full_name"),
    supabase
      .from("offers")
      .select("id, application_id, job_opening_id, status, created_at")
      .eq("organization_id", orgId)
      .is("deleted_at", null),
  ]);

  return {
    applications: (applications ?? []) as RawApplication[],
    stageHistory: (stageHistory ?? []) as RawStageHistoryRow[],
    stages: (stages ?? []) as RawStage[],
    jobs: (jobs ?? []) as RawJob[],
    candidates: (candidates ?? []) as RawCandidate[],
    sources: (sources ?? []) as RawCandidateSource[],
    interviews: (interviews ?? []) as RawInterview[],
    scorecards: (scorecards ?? []) as RawScorecardSubmission[],
    profiles: (profiles ?? []) as RawUserProfile[],
    offers: (offers ?? []) as RawOffer[],
  };
}

export function parseDateRange(searchParams: URLSearchParams): DateRange {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const now = new Date();

  return {
    from: from ? new Date(from) : new Date(now.getTime() - 30 * 86400000),
    to: to ? new Date(to) : now,
  };
}
