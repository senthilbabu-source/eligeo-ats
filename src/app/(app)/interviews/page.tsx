import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/constants/roles";

export const metadata: Metadata = {
  title: "Interviews",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-red-100 text-red-700",
};

const TYPE_LABELS: Record<string, string> = {
  phone_screen: "Phone Screen",
  technical: "Technical",
  behavioral: "Behavioral",
  panel: "Panel",
  culture_fit: "Culture Fit",
  final: "Final",
  other: "Other",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const sp = searchParams ? await searchParams : {};
  const supabase = await createClient();

  if (!can(session.orgRole, "interviews:view")) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-sm text-muted-foreground">You do not have permission to view interviews.</p>
      </div>
    );
  }

  // Filter: owners and admins default to org-wide ("all") — their view should
  // show the full picture on first load. HMs, recruiters, and interviewers
  // default to "mine" — they care about their own schedule.
  const defaultAll = session.orgRole === "owner" || session.orgRole === "admin";
  const filterMine = defaultAll ? sp.filter === "mine" : sp.filter !== "all";

  // URL param to preserve current filter state across Past/Upcoming toggles.
  // Only append when overriding the role default.
  const filterParam = filterMine && defaultAll
    ? "filter=mine"
    : !filterMine && !defaultAll
    ? "filter=all"
    : "";

  // Build query
  let query = supabase
    .from("interviews")
    .select(
      `id, interview_type, scheduled_at, duration_minutes, location,
       meeting_url, status, feedback_deadline_at,
       interviewer_id, application_id, job_id, created_at`,
    )
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  if (filterMine) {
    query = query.eq("interviewer_id", session.userId);
  }

  // Exclude terminal statuses for the default view (show upcoming)
  const showPast = sp.show === "past";
  if (!showPast) {
    query = query.in("status", ["scheduled", "confirmed"]);
  }

  const { data: interviews } = await query;

  // Pre-fetch interviewer names
  const interviewerIds = [...new Set((interviews ?? []).map((i) => i.interviewer_id))];
  let nameMap: Map<string, string> = new Map();
  if (interviewerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, full_name")
      .in("id", interviewerIds);
    nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]));
  }

  // Pre-fetch job titles
  const jobIds = [...new Set((interviews ?? []).map((i) => i.job_id))];
  let jobMap: Map<string, string> = new Map();
  if (jobIds.length > 0) {
    const { data: jobs } = await supabase
      .from("job_openings")
      .select("id, title")
      .in("id", jobIds);
    jobMap = new Map((jobs ?? []).map((j) => [j.id, j.title]));
  }

  // Pre-fetch candidate names via application → candidate
  const applicationIds = [...new Set((interviews ?? []).map((i) => i.application_id))];
  const candidateByApp: Map<string, { id: string; name: string }> = new Map();
  if (applicationIds.length > 0) {
    const { data: apps } = await supabase
      .from("applications")
      .select("id, candidate_id")
      .in("id", applicationIds);

    const candidateIds = [...new Set((apps ?? []).map((a) => a.candidate_id))];
    if (candidateIds.length > 0) {
      const { data: candidates } = await supabase
        .from("candidates")
        .select("id, full_name")
        .in("id", candidateIds);
      const candidateNameMap = new Map(
        (candidates ?? []).map((c) => [c.id, c.full_name ?? "Unknown"]),
      );
      for (const app of apps ?? []) {
        candidateByApp.set(app.id, {
          id: app.candidate_id,
          name: candidateNameMap.get(app.candidate_id) ?? "Unknown",
        });
      }
    }
  }

  // Check overdue feedback
  const nowMs = new Date().getTime();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Interviews</h1>
        <div className="flex items-center gap-2">
          {can(session.orgRole, "interviews:view") && (
            <Link
              href={[
                "/interviews",
                "?filter=", filterMine ? "all" : "mine",
                showPast ? "&show=past" : "",
              ].join("")}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              {filterMine ? "Show All" : "Show Mine"}
            </Link>
          )}
          <Link
            href={[
              "/interviews",
              "?show=", showPast ? "" : "past",
              filterParam ? `&${filterParam}` : "",
            ].join("")}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            {showPast ? "Upcoming" : "Past"}
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {(interviews ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            {filterMine
              ? "No upcoming interviews assigned to you."
              : "No interviews found."}
          </p>
        )}
        {(interviews ?? []).map((interview) => {
          const candidate = candidateByApp.get(interview.application_id);
          const jobTitle = jobMap.get(interview.job_id) ?? "Unknown Job";
          const interviewerName = nameMap.get(interview.interviewer_id) ?? "Unknown";
          const overdue =
            interview.feedback_deadline_at &&
            interview.status !== "cancelled" &&
            new Date(interview.feedback_deadline_at).getTime() < nowMs;

          return (
            <div
              key={interview.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {TYPE_LABELS[interview.interview_type] ?? interview.interview_type}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[interview.status] ?? ""}`}>
                    {interview.status.replace("_", " ")}
                  </span>
                  {overdue && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Overdue
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {candidate ? (
                    <Link
                      href={`/candidates/${candidate.id}`}
                      className="text-primary hover:underline"
                    >
                      {candidate.name}
                    </Link>
                  ) : (
                    "Unknown Candidate"
                  )}
                  {" for "}
                  <span className="font-medium">{jobTitle}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(interview.scheduled_at)}
                  {interview.duration_minutes ? ` (${interview.duration_minutes}m)` : ""}
                  {!filterMine && ` — ${interviewerName}`}
                </p>
                {interview.meeting_url && (
                  <a
                    href={interview.meeting_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-block text-xs text-primary hover:underline"
                  >
                    Join meeting
                  </a>
                )}
              </div>
              <div className="shrink-0">
                {candidate && (
                  <Link
                    href={`/candidates/${candidate.id}`}
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    View
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
