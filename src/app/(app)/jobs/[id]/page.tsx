import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/constants/roles";
import { JobActions } from "./job-actions";
import { AiMatchPanel } from "./ai-match-panel";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("job_openings")
    .select(
      `
      id, title, slug, description, department, location, location_type,
      employment_type, salary_min, salary_max, salary_currency, status,
      headcount, published_at, created_at, job_embedding
    `,
    )
    .eq("id", id)
    .single();

  if (!job) notFound();

  // Get application count for this job
  const { count: applicationCount } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("job_opening_id", id);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/jobs"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All Jobs
      </Link>

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
        {can(session.orgRole, "jobs:edit") && (
          <JobActions jobId={job.id} status={job.status} />
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

      {job.description && (
        <div className="mt-8">
          <h2 className="text-lg font-medium">Description</h2>
          <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {job.description}
          </div>
        </div>
      )}

      <AiMatchPanel jobId={job.id} hasEmbedding={job.job_embedding !== null} />
    </div>
  );
}
