import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Careers — Eligeo",
  description: "View open positions and apply",
};

export default async function CareersPage() {
  const supabase = createServiceClient();

  // Fetch only published (open) jobs across all orgs
  // In production, this would be filtered by org based on domain/subdomain
  const { data: jobs } = await supabase
    .from("job_openings")
    .select(
      `
      id, title, slug, department, location, location_type,
      employment_type, salary_min, salary_max, salary_currency,
      published_at, organization_id,
      organizations:organization_id (name)
    `,
    )
    .eq("status", "open")
    .is("deleted_at", null)
    .order("published_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Open Positions</h1>
        <p className="mt-2 text-muted-foreground">
          Find your next opportunity. Apply today.
        </p>
      </div>

      <div className="mt-10 space-y-4">
        {jobs?.map((job) => {
          const orgRaw = job.organizations as unknown;
          const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { name: string } | null;

          return (
            <Link
              key={job.id}
              href={`/careers/${job.slug}`}
              className="block rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/50 hover:bg-muted/30"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{job.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {org?.name}
                    {job.department && ` · ${job.department}`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {job.employment_type?.replace("_", " ")}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                {job.location && <span>{job.location}</span>}
                <span>{job.location_type?.replace("_", " ")}</span>
                {job.salary_min && job.salary_max && (
                  <span>
                    {job.salary_currency} {job.salary_min.toLocaleString()}–
                    {job.salary_max.toLocaleString()}
                  </span>
                )}
              </div>
            </Link>
          );
        })}

        {(!jobs || jobs.length === 0) && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
            <p>No open positions at this time.</p>
            <p className="mt-1 text-sm">Check back soon!</p>
          </div>
        )}
      </div>
    </div>
  );
}
