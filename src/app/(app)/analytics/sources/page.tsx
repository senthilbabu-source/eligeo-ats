import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { redirect } from "next/navigation";
import { fetchAnalyticsRawData } from "@/lib/analytics/fetch";
import { computeSourceAnalytics } from "@/lib/analytics/compute";
import { DateRangeSelect, parseDateRangeParam } from "@/components/analytics/date-range-select";
import { SourcesClient } from "./sources-client";

export const metadata: Metadata = { title: "Source Quality — Eligeo Analytics" };

export default async function SourcesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  if (!can(session.orgRole, "analytics:view")) redirect("/dashboard");

  const sp = searchParams ? await searchParams : {};
  const range = typeof sp.range === "string" ? sp.range : "30";
  const { from, to } = parseDateRangeParam(range);
  const dateRange = { from: new Date(from), to: new Date(to) };

  const raw = await fetchAnalyticsRawData(session.orgId, dateRange);
  const sources = computeSourceAnalytics({
    applications: raw.applications,
    candidates: raw.candidates,
    sources: raw.sources,
    dateRange,
  });

  const orgContext = {
    totalOpenJobs: raw.jobs.filter((j) => j.status === "open").length,
    teamSize: raw.profiles.length,
    avgTimeToHire: 0,
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/analytics" className="text-xs text-muted-foreground hover:text-foreground">← Analytics</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Source Quality</h1>
        </div>
        <DateRangeSelect />
      </div>

      <SourcesClient sources={sources} orgContext={orgContext} />
    </div>
  );
}
