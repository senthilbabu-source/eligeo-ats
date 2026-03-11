import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/constants/roles";
import { ApplyToJobForm } from "./apply-to-job-form";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();
  const supabase = await createClient();

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      `
      id, full_name, email, phone, current_title, current_company,
      location, linkedin_url, github_url, portfolio_url, resume_url,
      skills, tags, source, source_id, pronouns, created_at,
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
      pipeline_stages:current_stage_id (name, stage_type)
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

  // Stable timestamp for days-in-stage calculation (avoids impure Date.now in JSX)
  const nowMs = new Date().getTime();

  // CP4: canonical source name from FK, fallback to freeform source text
  const sourceRaw = candidate.candidate_sources as unknown;
  const sourceObj = (Array.isArray(sourceRaw) ? sourceRaw[0] : sourceRaw) as { name: string } | null;
  const sourceName = sourceObj?.name ?? candidate.source ?? null;

  // CP8: profile header badges
  const hasResume = Boolean(candidate.resume_url);
  const hasPortfolio = Boolean(candidate.portfolio_url);
  const isReferral = sourceName?.toLowerCase().includes("referral") ?? false;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/candidates"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All Candidates
      </Link>

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {candidate.full_name}
          </h1>
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
              <div
                key={app.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <p className="font-medium">{job?.title ?? "Unknown Job"}</p>
                  <p className="text-sm text-muted-foreground">
                    Applied{" "}
                    {new Date(app.applied_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-right">
                  {daysInStage !== null && (
                    <span className="text-xs text-muted-foreground">
                      {daysInStage}d in stage
                    </span>
                  )}
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {stage?.name ?? app.status}
                  </span>
                </div>
              </div>
            );
          })}
          {(!applications || applications.length === 0) && (
            <p className="text-sm text-muted-foreground">No applications yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
