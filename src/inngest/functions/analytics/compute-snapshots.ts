import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import {
  computeFunnelAnalytics,
  computeVelocityAnalytics,
  computeSourceAnalytics,
  computeTeamAnalytics,
  computeJobAnalytics,
  type DateRange,
} from "@/lib/analytics/compute";

/**
 * analytics/compute-snapshots
 *
 * Nightly cron (1 AM UTC) that computes all 5 snapshot types for each org.
 * Also triggered manually via `ats/analytics.snapshots-requested` event.
 * Processes orgs in batches of 10 to avoid memory pressure.
 * Idempotent: upserts by (organization_id, snapshot_date, snapshot_type) unique index.
 *
 * D33 §6 — Phase 7 Wave A1
 */
export const computeAnalyticsSnapshots = inngest.createFunction(
  {
    id: "analytics-compute-snapshots",
    name: "Analytics: Compute Nightly Snapshots",
    concurrency: { limit: 1 },
  },
  [
    { cron: "0 1 * * *" },
    { event: "ats/analytics.snapshots-requested" },
  ],
  async ({ step }) => {
    const supabase = createServiceClient();

    // Step 1: Fetch all active organizations
    const orgs = await step.run("fetch-orgs", async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id")
        .is("deleted_at", null);
      return data ?? [];
    });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const snapshotDate = yesterday.toISOString().slice(0, 10);

    // 30-day lookback for snapshot computation
    const dateRange: DateRange = {
      from: new Date(yesterday.getTime() - 30 * 86400000),
      to: yesterday,
    };

    let processedCount = 0;

    // Step 2: Process orgs in batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < orgs.length; i += BATCH_SIZE) {
      const batch = orgs.slice(i, i + BATCH_SIZE);

      await step.run(`compute-batch-${i}`, async () => {
        for (const org of batch) {
          await computeOrgSnapshots(supabase, org.id, snapshotDate, dateRange);
          processedCount++;
        }
      });
    }

    return { processedCount, snapshotDate };
  }
);

async function computeOrgSnapshots(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  snapshotDate: string,
  dateRange: DateRange
) {
  // Fetch all raw data for the org in parallel
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

  const rawApps = applications ?? [];
  const rawHistory = stageHistory ?? [];
  const rawStages = stages ?? [];
  const rawJobs = jobs ?? [];
  const rawCandidates = candidates ?? [];
  const rawSources = sources ?? [];
  const rawInterviews = interviews ?? [];
  const rawScorecards = scorecards ?? [];
  const rawProfiles = profiles ?? [];
  const rawOffers = offers ?? [];

  // Compute all 5 snapshot types
  const snapshots: Array<{ type: string; data: object }> = [
    {
      type: "funnel_daily",
      data: computeFunnelAnalytics({
        applications: rawApps,
        stageHistory: rawHistory,
        stages: rawStages,
        dateRange,
      }),
    },
    {
      type: "velocity_daily",
      data: computeVelocityAnalytics({
        applications: rawApps,
        stageHistory: rawHistory,
        stages: rawStages,
        jobs: rawJobs,
        dateRange,
      }),
    },
    {
      type: "source_daily",
      data: computeSourceAnalytics({
        applications: rawApps,
        candidates: rawCandidates,
        sources: rawSources,
        dateRange,
      }),
    },
    {
      type: "team_daily",
      data: computeTeamAnalytics({
        jobs: rawJobs,
        applications: rawApps,
        interviews: rawInterviews,
        scorecards: rawScorecards,
        profiles: rawProfiles,
        dateRange,
      }),
    },
    {
      type: "job_daily",
      data: computeJobAnalytics({
        jobs: rawJobs,
        applications: rawApps,
        stageHistory: rawHistory,
        offers: rawOffers,
        dateRange,
      }),
    },
  ];

  // Upsert each snapshot (idempotent via unique index)
  for (const snapshot of snapshots) {
    // Check if existing snapshot exists for this org/date/type
    const { data: existing } = await supabase
      .from("analytics_snapshots")
      .select("id")
      .eq("organization_id", orgId)
      .eq("snapshot_date", snapshotDate)
      .eq("snapshot_type", snapshot.type)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("analytics_snapshots")
        .update({ data: snapshot.data, computed_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("analytics_snapshots").insert({
        organization_id: orgId,
        snapshot_date: snapshotDate,
        snapshot_type: snapshot.type,
        data: snapshot.data,
        computed_at: new Date().toISOString(),
      });
    }
  }
}

// Re-export for Inngest route registration
export const analyticsComputeSnapshots = computeAnalyticsSnapshots;
