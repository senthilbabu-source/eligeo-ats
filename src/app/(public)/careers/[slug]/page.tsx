import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { ApplicationForm } from "./application-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createServiceClient();
  const { data: job } = await supabase
    .from("job_openings")
    .select("title")
    .eq("slug", slug)
    .eq("status", "open")
    .is("deleted_at", null)
    .single();

  return {
    title: job ? `${job.title} — Careers` : "Job Not Found",
  };
}

export default async function CareerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: job } = await supabase
    .from("job_openings")
    .select(
      `
      id, title, slug, description, department, location, location_type,
      employment_type, salary_min, salary_max, salary_currency,
      published_at, headcount,
      organizations:organization_id (name)
    `,
    )
    .eq("slug", slug)
    .eq("status", "open")
    .is("deleted_at", null)
    .single();

  if (!job) notFound();

  const orgRaw = job.organizations as unknown;
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { name: string } | null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/careers"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All Positions
      </Link>

      <div className="mt-6">
        <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {org?.name}
          {job.department && ` · ${job.department}`}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {job.location && (
          <span className="rounded-full border border-border px-3 py-1 text-sm">
            {job.location}
          </span>
        )}
        <span className="rounded-full border border-border px-3 py-1 text-sm">
          {job.location_type?.replace("_", " ")}
        </span>
        <span className="rounded-full border border-border px-3 py-1 text-sm">
          {job.employment_type?.replace("_", " ")}
        </span>
        {job.salary_min && job.salary_max && (
          <span className="rounded-full border border-border px-3 py-1 text-sm">
            {job.salary_currency} {job.salary_min.toLocaleString()}–
            {job.salary_max.toLocaleString()}
          </span>
        )}
        {job.headcount > 1 && (
          <span className="rounded-full border border-border px-3 py-1 text-sm">
            {job.headcount} openings
          </span>
        )}
      </div>

      {job.description && (
        <div className="mt-8 whitespace-pre-wrap text-muted-foreground leading-relaxed">
          {job.description}
        </div>
      )}

      <ApplicationForm jobId={job.id} jobTitle={job.title} />
    </div>
  );
}
