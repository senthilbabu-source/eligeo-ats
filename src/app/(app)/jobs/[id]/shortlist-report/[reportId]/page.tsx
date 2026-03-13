import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";
import { formatInTz, getUserTimezone } from "@/lib/datetime-server";
import { ShortlistReportClient } from "./report-client";

export default async function ShortlistReportPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id: jobId, reportId } = await params;
  const session = await requireAuth();
  const supabase = await createClient();
  const tz = await getUserTimezone(session.userId, session.orgId);

  // Fetch report
  const { data: report } = await supabase
    .from("ai_shortlist_reports")
    .select(
      "id, status, total_applications, shortlist_count, hold_count, reject_count, insufficient_data_count, executive_summary, hiring_manager_note, completed_at, created_at",
    )
    .eq("id", reportId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!report) notFound();

  // Fetch job title
  const { data: job } = await supabase
    .from("job_openings")
    .select("title")
    .eq("id", jobId)
    .single();

  // Fetch candidates for this report with candidate details
  const { data: candidateRows } = await supabase
    .from("ai_shortlist_candidates")
    .select(`
      id, candidate_id, application_id, ai_tier, recruiter_tier,
      composite_score, skills_score, experience_score, education_score,
      domain_score, trajectory_score, strengths, gaps,
      clarifying_question, reject_reason, eeoc_flags,
      tier_overridden_at, tier_overridden_by
    `)
    .eq("report_id", reportId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("composite_score", { ascending: false, nullsFirst: false });

  // Fetch candidate names
  const candidateIds = (candidateRows ?? []).map((c) => c.candidate_id);
  const { data: candidateDetails } = candidateIds.length > 0
    ? await supabase
        .from("candidates")
        .select("id, full_name, current_title")
        .in("id", candidateIds)
    : { data: [] };

  const nameMap = new Map(
    (candidateDetails ?? []).map((c) => [c.id, { name: c.full_name, title: c.current_title }]),
  );

  const candidates = (candidateRows ?? []).map((row) => ({
    ...row,
    candidateName: nameMap.get(row.candidate_id)?.name ?? "Unknown",
    candidateTitle: nameMap.get(row.candidate_id)?.title ?? null,
    strengths: (row.strengths ?? []) as string[],
    gaps: (row.gaps ?? []) as string[],
    eeoc_flags: (row.eeoc_flags ?? []) as string[],
  }));

  const hasEeocFlags = candidates.some((c) => c.eeoc_flags.length > 0);
  const canEdit = can(session.orgRole, "jobs:edit");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href={`/jobs/${jobId}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back to job
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">AI Shortlist Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {job?.title ?? "Job"} · Generated{" "}
          {report.completed_at
            ? formatInTz(report.completed_at, tz)
            : "processing..."}{" "}
          · {report.total_applications} applications analyzed
        </p>
      </div>

      {report.status !== "complete" && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            Report is {report.status}...
          </p>
          <p className="text-xs text-amber-600">
            Refresh this page in a few moments.
          </p>
        </div>
      )}

      {report.status === "complete" && (
        <>
          {/* Executive Summary */}
          {report.executive_summary && (
            <div className="mt-6 rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Executive Summary</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {report.executive_summary}
              </p>
              {report.hiring_manager_note && (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  Hiring Manager Note: {report.hiring_manager_note}
                </p>
              )}
            </div>
          )}

          {/* EEOC Notice */}
          {hasEeocFlags && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                AI flags noted on {candidates.filter((c) => c.eeoc_flags.length > 0).length} candidates — review before final decisions.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Employment gaps, career breaks, and credential gaps may reflect protected leave or
                systemic barriers. AI tiers are recommendations only.
              </p>
            </div>
          )}

          {/* Summary Stats */}
          <div className="mt-6 grid grid-cols-4 gap-3">
            <StatCard label="Shortlisted" count={report.shortlist_count} color="text-green-700 bg-green-50 border-green-200" />
            <StatCard label="Hold" count={report.hold_count} color="text-amber-700 bg-amber-50 border-amber-200" />
            <StatCard label="Rejected" count={report.reject_count} color="text-red-700 bg-red-50 border-red-200" />
            <StatCard label="Insufficient Data" count={report.insufficient_data_count} color="text-gray-600 bg-gray-50 border-gray-200" />
          </div>

          {/* Candidate cards — client component for tier override interactivity */}
          <ShortlistReportClient
            candidates={candidates}
            canOverride={canEdit}
            jobId={jobId}
          />

          <div className="mt-8 text-center text-xs text-muted-foreground">
            AI Recommendation Only — Final Decision by Human Recruiter
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${color}`}>
      <p className="text-xl font-semibold tabular-nums">{count}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}
