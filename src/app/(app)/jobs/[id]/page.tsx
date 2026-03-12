import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/constants/roles";
import { JobActions } from "./job-actions";
import { AiMatchPanel } from "./ai-match-panel";
import { RewritePanel } from "./rewrite-panel";
import { TitleSuggestionBadge } from "./title-suggestion";
import { SkillsDeltaPanel } from "./skills-delta-panel";
import { CloneChecklist } from "./clone-checklist";
import { JdQualityPanel } from "./jd-quality-panel";
import type { JobMetadata } from "@/lib/types/ground-truth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("job_openings")
    .select("title")
    .eq("id", id)
    .single();

  return { title: job?.title ?? "Job" };
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Command bar deep-link: ?action=clone&reason=new_location&location=London
  const autoClone = sp.action === "clone";
  const cloneReason = sp.reason as import("@/lib/types/ground-truth").CloneIntent["reason"] | undefined;
  const cloneLocation = typeof sp.location === "string" ? sp.location : undefined;
  const cloneLevel = typeof sp.level === "string" ? sp.level : undefined;

  const session = await requireAuth();
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("job_openings")
    .select(
      `
      id, title, slug, description, description_previous, metadata,
      department, location, location_type,
      employment_type, salary_min, salary_max, salary_currency, status,
      headcount, hiring_manager_id, published_at, created_at, job_embedding, embedding_updated_at
    `,
    )
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!job) notFound();

  const meta = (job.metadata ?? {}) as JobMetadata;
  const cloneIntent = meta.clone_intent ?? null;

  // A6 — fetch required skills for skill gap explanation on match panel
  const { data: requiredSkillRows } = await supabase
    .from("job_required_skills")
    .select("skills:skill_id (name)")
    .eq("job_id", id)
    .is("deleted_at", null);

  const requiredSkills = (requiredSkillRows ?? [])
    .map((s) => {
      const raw = s.skills as unknown;
      const skill = (Array.isArray(raw) ? raw[0] : raw) as { name: string } | null;
      return skill?.name ?? "";
    })
    .filter(Boolean);

  // Parallel queries: application count + per-stage breakdown (JI1/JI3)
  const [{ count: applicationCount }, { data: stageCountRows }] = await Promise.all([
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("job_opening_id", id)
      .eq("organization_id", session.orgId)
      .is("deleted_at", null),
    supabase
      .from("applications")
      .select(`
        current_stage_id,
        pipeline_stages!inner(name, stage_order, stage_type)
      `)
      .eq("job_opening_id", id)
      .eq("organization_id", session.orgId)
      .eq("status", "active")
      .is("deleted_at", null),
  ]);

  // Aggregate per-stage counts (JI3)
  const stageCounts: Record<string, { name: string; order: number; count: number }> = {};
  for (const row of stageCountRows ?? []) {
    const stageRaw = row.pipeline_stages as unknown;
    const stage = (Array.isArray(stageRaw) ? stageRaw[0] : stageRaw) as { name: string; stage_order: number } | null;
    if (!stage || !row.current_stage_id) continue;
    const key = row.current_stage_id;
    if (!stageCounts[key]) stageCounts[key] = { name: stage.name, order: stage.stage_order, count: 0 };
    stageCounts[key]!.count++;
  }
  const stageBreakdown = Object.values(stageCounts).sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/jobs"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All Jobs
      </Link>

      {cloneIntent && (
        <CloneChecklist
          jobId={job.id}
          jobMeta={meta}
          hasSalary={Boolean(job.salary_min && job.salary_max)}
          hasHiringManager={Boolean(job.hiring_manager_id)}
          hasEmbedding={job.job_embedding !== null}
        />
      )}

      {cloneIntent && (
        <TitleSuggestionBadge
          jobId={job.id}
          currentTitle={job.title}
          cloneIntent={cloneIntent}
          canEdit={can(session.orgRole, "jobs:edit")}
        />
      )}

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
            {job.department && (
              <span className="rounded-md bg-muted px-2 py-0.5">
                {job.department}
              </span>
            )}
            {job.location && <span>{job.location}</span>}
            <span>{job.location_type?.replace("_", " ")}</span>
            <span>{job.employment_type?.replace("_", " ")}</span>
            {job.salary_min && job.salary_max && (
              <span>
                {job.salary_currency} {job.salary_min.toLocaleString()}–
                {job.salary_max.toLocaleString()}
              </span>
            )}
          </div>
        </div>
        {(can(session.orgRole, "jobs:edit") || can(session.orgRole, "jobs:create")) && (
          <JobActions
            jobId={job.id}
            status={job.status}
            canEdit={can(session.orgRole, "jobs:edit")}
            canCreate={can(session.orgRole, "jobs:create")}
            autoOpen={autoClone && can(session.orgRole, "jobs:create")}
            initialReason={cloneReason}
            initialLocation={cloneLocation}
            initialLevel={cloneLevel}
          />
        )}
      </div>

      <div className="mt-6">
        <Link
          href={`/jobs/${job.id}/pipeline`}
          className="inline-flex h-9 items-center rounded-md bg-primary/10 px-4 text-sm font-medium text-primary hover:bg-primary/20"
        >
          View Pipeline Board
        </Link>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-semibold">{applicationCount ?? 0}</p>
          <p className="text-sm text-muted-foreground">Applications</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-semibold">{job.headcount}</p>
          <p className="text-sm text-muted-foreground">Openings</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-2xl font-semibold capitalize">{job.status}</p>
          <p className="text-sm text-muted-foreground">Status</p>
        </div>
      </div>

      {/* JI1/JI3 — Pipeline stage count sidebar */}
      {stageBreakdown.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pipeline Breakdown
          </h3>
          <div className="space-y-2">
            {stageBreakdown.map((s) => {
              const max = Math.max(1, ...stageBreakdown.map((x) => x.count));
              return (
                <div key={s.name} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{s.name}</span>
                  <div className="flex-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary/60"
                        style={{ width: `${Math.round((s.count / max) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{s.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {job.description && (
        <div className="mt-8">
          <h2 className="text-lg font-medium">Description</h2>
          <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {job.description}
          </div>
        </div>
      )}

      <JdQualityPanel
        jobId={job.id}
        description={job.description ?? null}
        salaryMin={job.salary_min ?? null}
        salaryMax={job.salary_max ?? null}
        location={job.location ?? null}
        canEdit={can(session.orgRole, "jobs:edit")}
      />

      {cloneIntent && (
        <SkillsDeltaPanel jobId={job.id} cloneIntent={cloneIntent} />
      )}

      <RewritePanel
        jobId={job.id}
        description={job.description ?? null}
        descriptionPrevious={job.description_previous ?? null}
        canEdit={can(session.orgRole, "jobs:edit")}
      />

      <AiMatchPanel
        jobId={job.id}
        hasEmbedding={job.job_embedding !== null}
        embeddingUpdatedAt={job.embedding_updated_at ?? null}
        requiredSkills={requiredSkills}
      />
    </div>
  );
}
