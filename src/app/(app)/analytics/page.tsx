import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analytics — Eligeo" };

const views = [
  {
    href: "/analytics/funnel",
    title: "Pipeline Funnel",
    description: "Stage conversion rates and candidate drop-off analysis",
    icon: "▷",
  },
  {
    href: "/analytics/velocity",
    title: "Hiring Velocity",
    description: "Time-to-hire, time-in-stage, and bottleneck detection",
    icon: "⏱",
  },
  {
    href: "/analytics/sources",
    title: "Source Quality",
    description: "Application volume, hire rates, and source ROI",
    icon: "◎",
  },
  {
    href: "/analytics/team",
    title: "Team Performance",
    description: "Recruiter pipeline velocity and interviewer timeliness",
    icon: "⚑",
    adminOnly: true,
  },
  {
    href: "/analytics/jobs",
    title: "Job Health",
    description: "Per-job health scores, predictions, and at-risk roles",
    icon: "◆",
  },
];

export default async function AnalyticsPage() {
  const session = await requireAuth();

  if (!can(session.orgRole, "analytics:view")) {
    redirect("/dashboard");
  }

  // Quick summary stats for the home page
  const supabase = await createClient();
  const orgId = session.orgId;
  const nowMs = new Date().getTime();
  const thirtyDaysAgo = new Date(nowMs - 30 * 86400000).toISOString();

  const [
    { count: openJobs },
    { count: activeApps },
    { data: hiredApps },
  ] = await Promise.all([
    supabase
      .from("job_openings")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "open")
      .is("deleted_at", null),
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active")
      .is("deleted_at", null),
    supabase
      .from("applications")
      .select("applied_at, hired_at")
      .eq("organization_id", orgId)
      .eq("status", "hired")
      .gte("hired_at", thirtyDaysAgo)
      .not("hired_at", "is", null)
      .is("deleted_at", null),
  ]);

  const hires30d = (hiredApps ?? []).length;
  const avgDays = hires30d > 0
    ? Math.round(
        (hiredApps ?? []).reduce((sum, a) => {
          const d = (new Date(a.hired_at!).getTime() - new Date(a.applied_at).getTime()) / 86400000;
          return sum + d;
        }, 0) / hires30d
      )
    : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Recruiting performance insights with AI-powered narratives.
      </p>

      {/* Quick stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open Jobs</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{openJobs ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Pipeline</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{activeApps ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hires (30d)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{hires30d}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avg Time to Hire</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{avgDays !== null ? `${avgDays}d` : "—"}</p>
        </div>
      </div>

      {/* View cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {views
          .filter((v) => !v.adminOnly || can(session.orgRole, "reports:view"))
          .map((view) => (
            <Link
              key={view.href}
              href={view.href}
              className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{view.icon}</span>
                <h2 className="text-sm font-semibold group-hover:text-primary">{view.title}</h2>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{view.description}</p>
            </Link>
          ))}
      </div>
    </div>
  );
}
