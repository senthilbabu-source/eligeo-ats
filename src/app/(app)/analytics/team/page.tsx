import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { redirect } from "next/navigation";
import { fetchAnalyticsRawData } from "@/lib/analytics/fetch";
import { computeTeamAnalytics } from "@/lib/analytics/compute";
import { DateRangeSelect, parseDateRangeParam } from "@/components/analytics/date-range-select";
import { TeamClient } from "./team-client";

export const metadata: Metadata = { title: "Team Performance — Eligeo Analytics" };

export default async function TeamPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();

  // Strict gate: owner/admin only
  if (!can(session.orgRole, "reports:view")) {
    redirect("/analytics");
  }

  const sp = searchParams ? await searchParams : {};
  const range = typeof sp.range === "string" ? sp.range : "30";
  const { from, to } = parseDateRangeParam(range);
  const dateRange = { from: new Date(from), to: new Date(to) };

  const raw = await fetchAnalyticsRawData(session.orgId, dateRange);
  const team = computeTeamAnalytics({
    jobs: raw.jobs,
    applications: raw.applications,
    interviews: raw.interviews,
    scorecards: raw.scorecards,
    profiles: raw.profiles,
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
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Team Performance</h1>
        </div>
        <DateRangeSelect />
      </div>

      <TeamClient team={team} orgContext={orgContext} />

      <p className="mt-8 text-xs text-muted-foreground">
        Team performance data is for coaching purposes. Share insights constructively.
      </p>
    </div>
  );
}
