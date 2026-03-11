import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/constants/roles";

export const metadata: Metadata = {
  title: "Jobs",
};

const STATUS_BADGES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-success/10 text-success",
  paused: "bg-warning/10 text-warning",
  closed: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

export default async function JobsPage() {
  const session = await requireAuth();
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("job_openings")
    .select(
      "id, title, slug, department, location, location_type, status, headcount, published_at, created_at",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {jobs?.length ?? 0} job{(jobs?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        {can(session.orgRole, "jobs:create") && (
          <Link
            href="/jobs/new"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            New Job
          </Link>
        )}
      </div>

      <div className="mt-6 space-y-2">
        {jobs?.map((job) => (
          <Link
            key={job.id}
            href={`/jobs/${job.id}`}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <h3 className="font-medium">{job.title}</h3>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[job.status] ?? ""}`}
                >
                  {job.status}
                </span>
              </div>
              <div className="mt-1 flex gap-4 text-sm text-muted-foreground">
                {job.department && <span>{job.department}</span>}
                {job.location && <span>{job.location}</span>}
                <span>{job.location_type?.replace("_", " ")}</span>
                <span>
                  {job.headcount} opening{job.headcount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </Link>
        ))}

        {(!jobs || jobs.length === 0) && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
            <p>No jobs yet.</p>
            {can(session.orgRole, "jobs:create") && (
              <p className="mt-1 text-sm">
                <Link href="/jobs/new" className="text-primary hover:underline">
                  Create your first job
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
