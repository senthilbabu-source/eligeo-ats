import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/constants/roles";
import { ApplyToJobForm } from "./apply-to-job-form";
import { InlineAppActions } from "./inline-app-actions";
import { NextBestAction } from "./next-best-action";
import { EmailDraftPanel } from "./email-draft-panel";
import { EditCandidatePanel } from "./edit-candidate-panel";
import { CandidateNotes } from "./candidate-notes";
import { ApplicationInterviews } from "./application-interviews";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("candidates")
    .select("full_name")
    .eq("id", id)
    .single();

  return { title: data?.full_name ?? "Candidate" };
}

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  // AR5/T10 — sequential nav: opened from a job's pipeline view
  const fromJobId = typeof sp.jobId === "string" ? sp.jobId : null;
  const session = await requireAuth();
  const supabase = await createClient();

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      `
      id, full_name, email, phone, current_title, current_company,
      location, linkedin_url, github_url, portfolio_url, resume_url,
      skills, tags, source, source_id, pronouns, created_at,
      embedding_updated_at, human_review_requested, resume_parsed_at,
      candidate_sources:source_id (name)
    `,
    )
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!candidate) notFound();

  // Get applications for this candidate
  const { data: applications } = await supabase
    .from("applications")
    .select(
      `
      id, status, applied_at,
      job_opening_id,
      job_openings:job_opening_id (title, slug),
      pipeline_stages:current_stage_id (name, stage_type, stage_order, pipeline_template_id)
    `,
    )
    .eq("candidate_id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("applied_at", { ascending: false });

  // CP2: Get the most recent stage-history entry per application to compute days-in-stage
  const applicationIds = (applications ?? []).map((a) => a.id);
  const stageEntryByApplication: Record<string, Date> = {};
  if (applicationIds.length > 0) {
    const { data: historyRows } = await supabase
      .from("application_stage_history")
      .select("application_id, created_at")
      .in("application_id", applicationIds)
      .eq("organization_id", session.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    // Latest entry per application = when they entered the current stage
    for (const row of historyRows ?? []) {
      if (!stageEntryByApplication[row.application_id]) {
        stageEntryByApplication[row.application_id] = new Date(row.created_at);
      }
    }
  }

  // AR4 — compute next stage for each active application
  // Collect unique pipeline_template_ids from current stages
  const templateIds = [...new Set(
    (applications ?? [])
      .filter((a) => a.status === "active")
      .map((a) => {
        const s = (Array.isArray(a.pipeline_stages) ? a.pipeline_stages[0] : a.pipeline_stages) as
          | { stage_order: number; pipeline_template_id: string } | null;
        return s?.pipeline_template_id;
      })
      .filter((t): t is string => Boolean(t))
  )];

  let allTemplateStages: Array<{ id: string; pipeline_template_id: string; stage_order: number }> = [];
  if (templateIds.length > 0) {
    const { data: ts } = await supabase
      .from("pipeline_stages")
      .select("id, pipeline_template_id, stage_order")
      .in("pipeline_template_id", templateIds)
      .is("deleted_at", null)
      .order("stage_order", { ascending: true });
    allTemplateStages = ts ?? [];
  }

  // For each application, find the next stage ID
  const nextStageByApplication: Record<string, string | null> = {};
  for (const app of applications ?? []) {
    if (app.status !== "active") { nextStageByApplication[app.id] = null; continue; }
    const stageRaw = (Array.isArray(app.pipeline_stages) ? app.pipeline_stages[0] : app.pipeline_stages) as
      | { stage_order: number; pipeline_template_id: string } | null;
    if (!stageRaw) { nextStageByApplication[app.id] = null; continue; }
    const tplStages = allTemplateStages.filter(
      (s) => s.pipeline_template_id === stageRaw.pipeline_template_id
    );
    const next = tplStages.find((s) => s.stage_order > stageRaw.stage_order);
    nextStageByApplication[app.id] = next?.id ?? null;
  }

  // AR5/T10 — sequential prev/next candidates for a job (when opened from pipeline)
  let prevCandidateId: string | null = null;
  let nextCandidateId: string | null = null;
  if (fromJobId) {
    const { data: jobApps } = await supabase
      .from("applications")
      .select("candidate_id")
      .eq("organization_id", session.orgId)
      .eq("job_opening_id", fromJobId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("applied_at", { ascending: true });
    const candidateQueue = (jobApps ?? []).map((a: { candidate_id: string }) => a.candidate_id);
    const myIndex = candidateQueue.indexOf(id);
    if (myIndex > 0) prevCandidateId = candidateQueue[myIndex - 1] ?? null;
    if (myIndex !== -1 && myIndex < candidateQueue.length - 1) nextCandidateId = candidateQueue[myIndex + 1] ?? null;
  }

  // Get open jobs for the "Apply to Job" form (exclude jobs already applied to)
  const appliedJobIds = applications?.map((a) => a.job_opening_id) ?? [];

  let openJobs: Array<{ id: string; title: string; firstStageId: string | null }> = [];

  if (can(session.orgRole, "applications:create")) {
    const { data: jobs } = await supabase
      .from("job_openings")
      .select("id, title, pipeline_template_id")
      .eq("organization_id", session.orgId)
      .eq("status", "open")
      .is("deleted_at", null)
      .order("title");

    if (jobs && jobs.length > 0) {
      // Get first stage for each pipeline template
      const templateIds = [...new Set(jobs.map((j) => j.pipeline_template_id))];
      const { data: stages } = await supabase
        .from("pipeline_stages")
        .select("id, pipeline_template_id, stage_order")
        .in("pipeline_template_id", templateIds)
        .is("deleted_at", null)
        .order("stage_order", { ascending: true });

      // Map template -> first stage
      const firstStageByTemplate: Record<string, string> = {};
      for (const stage of stages ?? []) {
        if (!firstStageByTemplate[stage.pipeline_template_id]) {
          firstStageByTemplate[stage.pipeline_template_id] = stage.id;
        }
      }

      openJobs = jobs
        .filter((j) => !appliedJobIds.includes(j.id))
        .map((j) => ({
          id: j.id,
          title: j.title,
          firstStageId: firstStageByTemplate[j.pipeline_template_id] ?? null,
        }));
    }
  }

  // CP9 — fetch rejection reasons for inline reject picker
  const { data: rejectionReasons } = await supabase
    .from("rejection_reasons")
    .select("id, name")
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("name");

  // P1-2 — fetch candidate notes
  const { data: notes } = await supabase
    .from("candidate_notes")
    .select("id, content, created_at, created_by, user_profiles:created_by (full_name)")
    .eq("candidate_id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Stable timestamp for days-in-stage calculation (avoids impure Date.now in JSX)
  const nowMs = new Date().getTime();

  // CP4: canonical source name from FK, fallback to freeform source text
  const sourceRaw = candidate.candidate_sources as unknown;
  const sourceObj = (Array.isArray(sourceRaw) ? sourceRaw[0] : sourceRaw) as { name: string } | null;
  const sourceName = sourceObj?.name ?? candidate.source ?? null;

  // H6-4: Fetch AI match scores for each active application
  const activeAppIds = (applications ?? []).filter((a) => a.status === "active").map((a) => a.id);
  const matchScoreByApp: Record<string, { score: number; explanation: string | null }> = {};
  if (activeAppIds.length > 0) {
    const { data: matches } = await supabase
      .from("ai_match_explanations")
      .select("application_id, match_score, explanation")
      .in("application_id", activeAppIds)
      .eq("organization_id", session.orgId);
    for (const m of matches ?? []) {
      if (m.match_score != null) {
        matchScoreByApp[m.application_id] = { score: m.match_score, explanation: m.explanation };
      }
    }
  }

  // H6-4: Embedding freshness
  const cand = candidate as { embedding_updated_at?: string | null; human_review_requested?: boolean | null; resume_parsed_at?: string | null };
  const embeddingAge = cand.embedding_updated_at
    ? Math.floor((nowMs - new Date(cand.embedding_updated_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const embeddingStatus: "fresh" | "stale" | "none" =
    embeddingAge === null ? "none" :
    embeddingAge <= 7 ? "fresh" :
    "stale";
  const hasDuplicateWarning = cand.human_review_requested === true;

  // CP8: profile header badges
  const hasResume = Boolean(candidate.resume_url);
  const hasPortfolio = Boolean(candidate.portfolio_url);
  const isReferral = sourceName?.toLowerCase().includes("referral") ?? false;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between">
        <Link
          href="/candidates"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; All Candidates
        </Link>
        {/* AR5/T10 — prev/next sequential navigation (visible when opened from pipeline) */}
        {fromJobId && (prevCandidateId || nextCandidateId) && (
          <div className="flex items-center gap-1 text-sm">
            {prevCandidateId ? (
              <Link
                href={`/candidates/${prevCandidateId}?jobId=${fromJobId}`}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                ← Prev
              </Link>
            ) : (
              <span className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground/40">← Prev</span>
            )}
            {nextCandidateId ? (
              <Link
                href={`/candidates/${nextCandidateId}?jobId=${fromJobId}`}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Next →
              </Link>
            ) : (
              <span className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground/40">Next →</span>
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {candidate.full_name}
          </h1>
          {can(session.orgRole, "candidates:edit") && (
            <EditCandidatePanel
              candidate={{
                id: candidate.id,
                full_name: candidate.full_name,
                email: candidate.email,
                phone: candidate.phone,
                current_title: candidate.current_title,
                current_company: candidate.current_company,
                location: candidate.location,
                linkedin_url: candidate.linkedin_url,
              }}
            />
          )}
          {/* CP8 — profile header badges */}
          {hasResume && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              Resume
            </span>
          )}
          {hasPortfolio && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              Portfolio
            </span>
          )}
          {isReferral && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              Referral
            </span>
          )}
          {/* H6-4: Embedding freshness badge */}
          {embeddingStatus === "fresh" && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Embedding fresh
            </span>
          )}
          {embeddingStatus === "stale" && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Embedding stale
            </span>
          )}
          {embeddingStatus === "none" && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              No embedding
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {candidate.email}
          {/* CP7 — pronouns inline */}
          {(candidate as { pronouns?: string | null }).pronouns && (
            <span className="ml-2 text-xs text-muted-foreground/70">
              ({(candidate as { pronouns?: string | null }).pronouns})
            </span>
          )}
        </p>
      </div>

      {/* H6-4: Duplicate warning banner */}
      {hasDuplicateWarning && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <span className="mt-0.5 shrink-0 font-medium">{"\u26A0"}</span>
          <p>Possible duplicate detected — review before proceeding.</p>
        </div>
      )}

      {/* H6-4: AI Match Scores per application */}
      {Object.keys(matchScoreByApp).length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(applications ?? [])
            .filter((a) => a.status === "active" && matchScoreByApp[a.id])
            .map((a) => {
              const m = matchScoreByApp[a.id]!;
              const jobRaw = a.job_openings as unknown;
              const job = (Array.isArray(jobRaw) ? jobRaw[0] : jobRaw) as { title: string } | null;
              return (
                <div key={a.id} className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">{job?.title ?? "Unknown Job"}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${
                      m.score >= 0.75 ? "text-green-600 dark:text-green-400" :
                      m.score >= 0.5 ? "text-amber-600 dark:text-amber-400" :
                      "text-red-600 dark:text-red-400"
                    }`}>
                      {(m.score * 100).toFixed(0)}%
                    </span>
                    <span className="text-xs text-muted-foreground">match</span>
                  </div>
                  {m.explanation && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{m.explanation}</p>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* CP10 — Next Best Action strip */}
      <Suspense fallback={null}>
        <NextBestAction candidateId={candidate.id} orgId={session.orgId} />
      </Suspense>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Profile */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Profile
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            {candidate.current_title && (
              <div>
                <dt className="text-muted-foreground">Title</dt>
                <dd>
                  {candidate.current_title}
                  {candidate.current_company &&
                    ` at ${candidate.current_company}`}
                </dd>
              </div>
            )}
            {candidate.location && (
              <div>
                <dt className="text-muted-foreground">Location</dt>
                <dd>{candidate.location}</dd>
              </div>
            )}
            {candidate.phone && (
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{candidate.phone}</dd>
              </div>
            )}
            {sourceName && (
              <div>
                <dt className="text-muted-foreground">Source</dt>
                <dd className="capitalize">{sourceName}</dd>
              </div>
            )}
            {candidate.linkedin_url && (
              <div>
                <dt className="text-muted-foreground">LinkedIn</dt>
                <dd>
                  <a
                    href={candidate.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    View Profile
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Skills & Tags */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Skills
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(candidate.skills as string[])?.map((skill) => (
              <span
                key={skill}
                className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
              >
                {skill}
              </span>
            ))}
            {(!candidate.skills ||
              (candidate.skills as string[]).length === 0) && (
              <p className="text-sm text-muted-foreground">No skills added</p>
            )}
          </div>

          {(candidate.tags as string[])?.length > 0 && (
            <>
              <h2 className="mt-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Tags
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(candidate.tags as string[]).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Apply to Job */}
      {can(session.orgRole, "applications:create") && (
        <div className="mt-8 rounded-lg border border-border bg-card p-5">
          <ApplyToJobForm candidateId={candidate.id} jobs={openJobs} />
        </div>
      )}

      {/* Applications */}
      <div className="mt-8">
        <h2 className="text-lg font-medium">Applications</h2>
        <div className="mt-3 space-y-2">
          {applications?.map((app) => {
            const jobRaw = app.job_openings as unknown;
            const job = (Array.isArray(jobRaw) ? jobRaw[0] : jobRaw) as { title: string; slug: string } | null;
            const stageRaw = app.pipeline_stages as unknown;
            const stage = (Array.isArray(stageRaw) ? stageRaw[0] : stageRaw) as { name: string; stage_type: string } | null;
            // CP2 — days in current stage
            const stageEnteredAt = stageEntryByApplication[app.id];
            const daysInStage = stageEnteredAt
              ? Math.floor((nowMs - stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24))
              : null;
            return (
              <div key={app.id} className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                  <div>
                    <p className="font-medium">{job?.title ?? "Unknown Job"}</p>
                    <p className="text-sm text-muted-foreground">
                      Applied{" "}
                      {new Date(app.applied_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-3">
                      {daysInStage !== null && (
                        <span className="text-xs text-muted-foreground">
                          {daysInStage}d in stage
                        </span>
                      )}
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {stage?.name ?? app.status}
                      </span>
                    </div>
                    {/* AR4 — inline advance/reject */}
                    {can(session.orgRole, "applications:move") && (
                      <InlineAppActions
                        applicationId={app.id}
                        nextStageId={nextStageByApplication[app.id] ?? null}
                        isActive={app.status === "active"}
                        rejectionReasons={rejectionReasons ?? []}
                      />
                    )}
                  </div>
                </div>
                {/* P3-W3 — Interview list per application */}
                {app.status === "active" && (
                  <div className="ml-4 rounded-lg border border-border/50 bg-card/50 p-4">
                    <Suspense fallback={<p className="text-xs text-muted-foreground">Loading interviews...</p>}>
                      <ApplicationInterviews applicationId={app.id} />
                    </Suspense>
                  </div>
                )}
              </div>
            );
          })}
          {(!applications || applications.length === 0) && (
            <p className="text-sm text-muted-foreground">No applications yet</p>
          )}
        </div>
      </div>

      {/* P1-2 — Candidate notes + activity timeline */}
      <CandidateNotes
        candidateId={candidate.id}
        notes={(notes ?? []) as unknown as Array<{
          id: string;
          content: string;
          created_at: string;
          created_by: string;
          user_profiles: { full_name: string } | null;
        }>}
        currentUserId={session.userId}
        isOwnerOrAdmin={can(session.orgRole, "candidates:edit")}
      />

      {/* N1/S6 — AI Email Draft panel (P1-6: with context enrichment) */}
      <EmailDraftPanel
        candidateName={candidate.full_name}
        jobOptions={(applications ?? [])
          .filter((a) => a.status === "active")
          .map((a) => {
            const jobRaw = a.job_openings as unknown;
            const job = (Array.isArray(jobRaw) ? jobRaw[0] : jobRaw) as { title: string; slug: string } | null;
            const stageRaw = a.pipeline_stages as unknown;
            const stage = (Array.isArray(stageRaw) ? stageRaw[0] : stageRaw) as { name: string } | null;
            const stageEnteredAt = stageEntryByApplication[a.id];
            const daysInStage = stageEnteredAt
              ? Math.floor((nowMs - stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24))
              : undefined;
            return job ? {
              id: a.job_opening_id,
              title: job.title,
              stageName: stage?.name,
              daysInStage,
            } : null;
          })
          .filter((j) => j !== null)}
      />
    </div>
  );
}
