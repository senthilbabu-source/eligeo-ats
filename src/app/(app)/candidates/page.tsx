import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can, type OrgRole } from "@/lib/constants/roles";
import { parsePagination, buildPaginationMeta } from "@/lib/utils/pagination";
import { Pagination } from "@/components/pagination";
import { CandidateFilterBar } from "./filter-bar";

export const metadata: Metadata = {
  title: "Candidates",
};

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const supabase = await createClient();
  const rawParams = await searchParams;
  const params = parsePagination(rawParams);

  // CL2 — filter params
  const query = typeof rawParams.q === "string" ? rawParams.q.trim() : "";
  const sourceId = typeof rawParams.source === "string" ? rawParams.source : "";
  const jobId = typeof rawParams.job === "string" ? rawParams.job : "";
  // R11 (Wave 1) — stage filter: from dashboard "Current Stage Distribution" bar links
  const stageId = typeof rawParams.stage === "string" ? rawParams.stage : "";

  // CL2 — fetch filter options in parallel
  const [{ data: sources }, { data: openJobs }] = await Promise.all([
    supabase
      .from("candidate_sources")
      .select("id, name")
      .eq("organization_id", session.orgId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("job_openings")
      .select("id, title")
      .eq("organization_id", session.orgId)
      .eq("status", "open")
      .is("deleted_at", null)
      .order("title"),
  ]);

  // CL2 — job filter: pre-fetch candidate IDs that applied to this job
  let jobCandidateIds: string[] | null = null;
  // H6-2: When job filter active, also fetch match scores
  const matchScoreByCandidate: Record<string, number> = {};
  if (jobId) {
    const { data: apps } = await supabase
      .from("applications")
      .select("candidate_id, id")
      .eq("organization_id", session.orgId)
      .eq("job_opening_id", jobId)
      .is("deleted_at", null);
    jobCandidateIds = (apps ?? []).map((a: { candidate_id: string }) => a.candidate_id);

    // Fetch match scores for these applications
    if (apps && apps.length > 0) {
      const appIds = apps.map((a: { id: string }) => a.id);
      const { data: matches } = await supabase
        .from("ai_match_explanations")
        .select("application_id, match_score")
        .in("application_id", appIds)
        .eq("organization_id", session.orgId);
      // Map application match score back to candidate
      const appToCand: Record<string, string> = {};
      for (const a of apps) appToCand[a.id] = a.candidate_id;
      for (const m of matches ?? []) {
        if (m.match_score != null) {
          matchScoreByCandidate[appToCand[m.application_id]!] = m.match_score;
        }
      }
    }
  }

  // R11 (Wave 1) — stage filter: pre-fetch candidate IDs currently in this stage
  let stageCandidateIds: string[] | null = null;
  if (stageId) {
    const { data: stageApps } = await supabase
      .from("applications")
      .select("candidate_id")
      .eq("organization_id", session.orgId)
      .eq("current_stage_id", stageId)
      .eq("status", "active")
      .is("deleted_at", null);
    stageCandidateIds = (stageApps ?? []).map((a: { candidate_id: string }) => a.candidate_id);
  }

  // Base query builder — apply all active filters
  let q = supabase
    .from("candidates")
    .select(
      "id, full_name, email, current_title, current_company, location, source, source_id, skills, tags, created_at",
      { count: "exact" },
    )
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (query) {
    const escaped = query.replace(/[%_\\]/g, "\\$&");
    q = q.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,current_title.ilike.%${escaped}%`);
  }
  if (sourceId) {
    q = q.eq("source_id", sourceId);
  }
  if (jobCandidateIds !== null) {
    if (jobCandidateIds.length === 0) {
      const emptyMeta = buildPaginationMeta(0, params);
      return (
        <CandidatesLayout
          session={session}
          sources={sources ?? []}
          openJobs={openJobs ?? []}
          query={query}
          sourceId={sourceId}
          jobId={jobId}
          stageId={stageId}
          candidates={[]}
          meta={emptyMeta}
          matchScores={matchScoreByCandidate}
        />
      );
    }
    q = q.in("id", jobCandidateIds);
  }

  if (stageCandidateIds !== null) {
    if (stageCandidateIds.length === 0) {
      const emptyMeta = buildPaginationMeta(0, params);
      return (
        <CandidatesLayout
          session={session}
          sources={sources ?? []}
          openJobs={openJobs ?? []}
          query={query}
          sourceId={sourceId}
          jobId={jobId}
          stageId={stageId}
          candidates={[]}
          meta={emptyMeta}
          matchScores={matchScoreByCandidate}
        />
      );
    }
    q = q.in("id", stageCandidateIds);
  }

  const { data: candidates, count } = await q
    .order("created_at", { ascending: false })
    .range(params.from, params.to);


  const meta = buildPaginationMeta(count ?? 0, params);

  return (
    <CandidatesLayout
      session={session}
      sources={sources ?? []}
      openJobs={openJobs ?? []}
      query={query}
      sourceId={sourceId}
      jobId={jobId}
      stageId={stageId}
      candidates={candidates ?? []}
      meta={meta}
      matchScores={matchScoreByCandidate}
    />
  );
}

// ── Layout component ────────────────────────────────────────

type CandidateRow = {
  id: string;
  full_name: string;
  email: string;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  source: string | null;
  source_id: string | null;
  skills: unknown;
  tags: unknown;
  created_at: string;
};

function CandidatesLayout({
  session,
  sources,
  openJobs,
  query,
  sourceId,
  jobId,
  stageId,
  candidates,
  meta,
  matchScores,
}: {
  session: { orgRole: OrgRole };
  sources: Array<{ id: string; name: string }>;
  openJobs: Array<{ id: string; title: string }>;
  query: string;
  sourceId: string;
  jobId: string;
  stageId: string;
  candidates: CandidateRow[];
  meta: ReturnType<typeof buildPaginationMeta>;
  matchScores: Record<string, number>;
}) {
  const hasMatchScores = Object.keys(matchScores).length > 0;
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.totalCount} candidate{meta.totalCount !== 1 ? "s" : ""}
          </p>
        </div>
        {can(session.orgRole, "candidates:create") && (
          <Link
            href="/candidates/new"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add Candidate
          </Link>
        )}
      </div>

      {/* CL2 — filter bar */}
      <CandidateFilterBar
        sources={sources}
        openJobs={openJobs}
        query={query}
        sourceId={sourceId}
        jobId={jobId}
        stageId={stageId}
      />

      <div className="mt-4">
        <table className="w-full text-data-dense">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="pb-3 pr-4">Name</th>
              {hasMatchScores && <th className="pb-3 pr-4">AI Fit</th>}
              <th className="pb-3 pr-4">Title</th>
              <th className="pb-3 pr-4">Location</th>
              <th className="pb-3 pr-4">Source</th>
              <th className="pb-3 pr-4">Skills</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {candidates.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="py-3 pr-4">
                  <Link
                    href={`/candidates/${c.id}`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {c.full_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                </td>
                {hasMatchScores && (
                  <td className="py-3 pr-4">
                    {matchScores[c.id] != null ? (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        matchScores[c.id]! >= 0.75 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        matchScores[c.id]! >= 0.5 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {(matchScores[c.id]! * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                <td className="py-3 pr-4 text-muted-foreground">
                  {c.current_title}
                  {c.current_company && (
                    <span className="text-xs"> at {c.current_company}</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {c.location}
                </td>
                <td className="py-3 pr-4 text-muted-foreground capitalize">
                  {c.source}
                </td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {(c.skills as string[])?.slice(0, 3).map((skill) => (
                      <span
                        key={skill}
                        className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                      >
                        {skill}
                      </span>
                    ))}
                    {(c.skills as string[])?.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{(c.skills as string[]).length - 3}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {candidates.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
            <p>No candidates found.</p>
          </div>
        )}
      </div>

      <Pagination meta={meta} basePath="/candidates" />
    </div>
  );
}
