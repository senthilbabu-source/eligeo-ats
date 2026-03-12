import { createClient } from "@/lib/supabase/server";

interface ActiveApp {
  id: string;
  stageEnteredAt: Date | null;
  stageName: string | null;
  jobTitle: string | null;
}

interface NBAAction {
  type: "stalled" | "no_applications";
  message: string;
}

/**
 * Pure function — determines next best action from active application data.
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
    };
  }

  // Find the most stalled active application
  let maxDays = 0;
  let stalledApp: ActiveApp | null = null;
  for (const app of activeApps) {
    if (!app.stageEnteredAt) continue;
    const days = Math.floor((nowMs - app.stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24));
    if (days > maxDays) {
      maxDays = days;
      stalledApp = app;
    }
  }

  if (stalledApp && maxDays >= stallThresholdDays) {
    const stage = stalledApp.stageName ?? "current stage";
    const job = stalledApp.jobTitle ? ` for ${stalledApp.jobTitle}` : "";
    return {
      type: "stalled",
      message: `${maxDays} days in ${stage}${job} — consider advancing or scheduling an interview.`,
    };
  }

  return null;
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

  const nowMs = new Date().getTime();

  const activeApps: ActiveApp[] = (apps ?? []).map((app) => {
    const jobRaw = app.job_openings as unknown;
    const job = (Array.isArray(jobRaw) ? jobRaw[0] : jobRaw) as { title: string } | null;
    const stageRaw = app.pipeline_stages as unknown;
    const stage = (Array.isArray(stageRaw) ? stageRaw[0] : stageRaw) as { name: string } | null;
    return {
      id: app.id,
      stageEnteredAt: stageEntryByApp[app.id] ?? null,
      stageName: stage?.name ?? null,
      jobTitle: job?.title ?? null,
    };
  });

  const action = computeNextBestAction({ activeApps, nowMs });

  if (!action) return null;

  const styles: Record<NBAAction["type"], string> = {
    stalled:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    no_applications:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  };

  const icons: Record<NBAAction["type"], string> = {
    stalled: "⏱",
    no_applications: "+",
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
