import { createClient } from "@/lib/supabase/server";

interface ActiveApp {
  id: string;
  stageEnteredAt: Date | null;
  stageName: string | null;
  jobTitle: string | null;
  /** H3-4: Optional enriched signals for richer NBA rules */
  matchScore?: number | null;
  hasInterview?: boolean;
  allScorecardsIn?: boolean;
  hasApprovedOffer?: boolean;
  offerSent?: boolean;
}

type NBAType =
  | "stalled"
  | "no_applications"
  | "high_match_no_interview"
  | "scorecard_complete"
  | "offer_ready"
  | "at_risk";

interface NBAAction {
  type: NBAType;
  message: string;
  /** H3-4: Priority for ordering when multiple rules match (lower = higher priority) */
  priority: number;
}

/**
 * Pure function — determines next best action from active application data.
 * H3-4: Expanded with richer rule signals beyond the original 14-day stall check.
 * Exported for unit testing.
 */
export function computeNextBestAction(params: {
  activeApps: ActiveApp[];
  nowMs: number;
  stallThresholdDays?: number;
}): NBAAction | null {
  const { activeApps, nowMs, stallThresholdDays = 14 } = params;

  if (activeApps.length === 0) {
    return {
      type: "no_applications",
      message: "No active applications — consider adding this candidate to a job opening.",
      priority: 5,
    };
  }

  const candidates: NBAAction[] = [];

  for (const app of activeApps) {
    const job = app.jobTitle ? ` for ${app.jobTitle}` : "";
    const daysInStage = app.stageEnteredAt
      ? Math.floor((nowMs - app.stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Rule: Offer ready — approved offer not yet sent (highest priority action)
    if (app.hasApprovedOffer && !app.offerSent) {
      candidates.push({
        type: "offer_ready",
        message: `Offer approved${job} — send to candidate.`,
        priority: 1,
      });
    }

    // Rule: Scorecard complete — all scorecards submitted, no advancement
    if (app.allScorecardsIn && !app.hasApprovedOffer) {
      candidates.push({
        type: "scorecard_complete",
        message: `All interview feedback received${job} — make a decision.`,
        priority: 2,
      });
    }

    // Rule: High match, no interview scheduled
    if (
      app.matchScore != null &&
      app.matchScore > 0.75 &&
      app.hasInterview === false
    ) {
      candidates.push({
        type: "high_match_no_interview",
        message: `Strong match (${(app.matchScore * 100).toFixed(0)}%)${job} — schedule an interview.`,
        priority: 3,
      });
    }

    // Rule: Stalled (existing, kept as-is)
    if (daysInStage >= stallThresholdDays) {
      const stage = app.stageName ?? "current stage";
      candidates.push({
        type: "stalled",
        message: `${daysInStage} days in ${stage}${job} — consider advancing or scheduling an interview.`,
        priority: 4,
      });
    }

    // Rule: At risk — in stage > 7 days + low match score
    if (
      daysInStage > 7 &&
      app.matchScore != null &&
      app.matchScore < 0.5
    ) {
      candidates.push({
        type: "at_risk",
        message: `Low fit (${(app.matchScore * 100).toFixed(0)}%) and ${daysInStage} days in stage${job} — consider rejection or talent pool.`,
        priority: 6,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Return highest-priority (lowest number) action
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0]!;
}

/**
 * CP10 — Next Best Action strip. Async server component, wrapped in <Suspense> by parent.
 */
export async function NextBestAction({
  candidateId,
  orgId,
}: {
  candidateId: string;
  orgId: string;
}) {
  const supabase = await createClient();

  const { data: apps } = await supabase
    .from("applications")
    .select(
      `
      id,
      job_openings:job_opening_id (title),
      pipeline_stages:current_stage_id (name)
    `,
    )
    .eq("candidate_id", candidateId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null);

  const appIds = (apps ?? []).map((a) => a.id);
  const stageEntryByApp: Record<string, Date> = {};

  if (appIds.length > 0) {
    const { data: history } = await supabase
      .from("application_stage_history")
      .select("application_id, created_at")
      .in("application_id", appIds)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    for (const row of history ?? []) {
      if (!stageEntryByApp[row.application_id]) {
        stageEntryByApp[row.application_id] = new Date(row.created_at);
      }
    }
  }

  // H6-3: Fetch enriched signals for all 6 NBA rules
  // Match scores from ai_match_explanations
  const matchScoreByApp: Record<string, number> = {};
  if (appIds.length > 0) {
    const { data: matches } = await supabase
      .from("ai_match_explanations")
      .select("application_id, match_score")
      .in("application_id", appIds)
      .eq("organization_id", orgId);
    for (const m of matches ?? []) {
      if (m.match_score != null) matchScoreByApp[m.application_id] = m.match_score;
    }
  }

  // Interviews per application
  const interviewByApp: Record<string, boolean> = {};
  if (appIds.length > 0) {
    const { data: interviews } = await supabase
      .from("interviews")
      .select("application_id, status")
      .in("application_id", appIds)
      .eq("organization_id", orgId)
      .is("deleted_at", null);
    for (const iv of interviews ?? []) {
      if (["scheduled", "confirmed", "completed"].includes(iv.status)) {
        interviewByApp[iv.application_id] = true;
      }
    }
  }

  // Scorecard submissions per application (via interviews)
  const allScorecardsInByApp: Record<string, boolean> = {};
  if (appIds.length > 0) {
    const { data: interviews } = await supabase
      .from("interviews")
      .select("id, application_id, status")
      .in("application_id", appIds)
      .eq("organization_id", orgId)
      .eq("status", "completed")
      .is("deleted_at", null);

    if (interviews && interviews.length > 0) {
      const interviewIds = interviews.map((i) => i.id);
      const { data: scorecards } = await supabase
        .from("scorecard_submissions")
        .select("interview_id, submitted_at")
        .in("interview_id", interviewIds)
        .is("deleted_at", null);

      // Group by application: all completed interviews must have a submitted scorecard
      const interviewsByApp: Record<string, string[]> = {};
      for (const iv of interviews) {
        if (!interviewsByApp[iv.application_id]) interviewsByApp[iv.application_id] = [];
        interviewsByApp[iv.application_id]!.push(iv.id);
      }
      const submittedInterviewIds = new Set(
        (scorecards ?? []).filter((s) => s.submitted_at).map((s) => s.interview_id)
      );
      for (const [appId, ivIds] of Object.entries(interviewsByApp)) {
        allScorecardsInByApp[appId] = ivIds.every((ivId) => submittedInterviewIds.has(ivId));
      }
    }
  }

  // Offers per application
  const offerStatusByApp: Record<string, { hasApproved: boolean; sent: boolean }> = {};
  if (appIds.length > 0) {
    const { data: offers } = await supabase
      .from("offers")
      .select("application_id, status")
      .in("application_id", appIds)
      .eq("organization_id", orgId)
      .is("deleted_at", null);
    for (const o of offers ?? []) {
      if (!offerStatusByApp[o.application_id]) {
        offerStatusByApp[o.application_id] = { hasApproved: false, sent: false };
      }
      if (o.status === "approved") offerStatusByApp[o.application_id]!.hasApproved = true;
      if (["sent", "signed"].includes(o.status)) offerStatusByApp[o.application_id]!.sent = true;
    }
  }

  const nowMs = new Date().getTime();

  const activeApps: ActiveApp[] = (apps ?? []).map((app) => {
    const jobRaw = app.job_openings as unknown;
    const job = (Array.isArray(jobRaw) ? jobRaw[0] : jobRaw) as { title: string } | null;
    const stageRaw = app.pipeline_stages as unknown;
    const stage = (Array.isArray(stageRaw) ? stageRaw[0] : stageRaw) as { name: string } | null;
    const offerStatus = offerStatusByApp[app.id];
    return {
      id: app.id,
      stageEnteredAt: stageEntryByApp[app.id] ?? null,
      stageName: stage?.name ?? null,
      jobTitle: job?.title ?? null,
      matchScore: matchScoreByApp[app.id] ?? null,
      hasInterview: interviewByApp[app.id] ?? false,
      allScorecardsIn: allScorecardsInByApp[app.id] ?? false,
      hasApprovedOffer: offerStatus?.hasApproved ?? false,
      offerSent: offerStatus?.sent ?? false,
    };
  });

  const action = computeNextBestAction({ activeApps, nowMs });

  if (!action) return null;

  const styles: Record<NBAType, string> = {
    stalled:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    no_applications:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
    high_match_no_interview:
      "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
    scorecard_complete:
      "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
    offer_ready:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    at_risk:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  };

  const icons: Record<NBAType, string> = {
    stalled: "\u23F1",
    no_applications: "+",
    high_match_no_interview: "\u2728",
    scorecard_complete: "\u2611",
    offer_ready: "\u2709",
    at_risk: "\u26A0",
  };

  return (
    <div className={`mt-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${styles[action.type]}`}>
      <span className="mt-0.5 shrink-0 font-medium">{icons[action.type]}</span>
      <p>
        <span className="font-medium">Next best action: </span>
        {action.message}
      </p>
    </div>
  );
}
