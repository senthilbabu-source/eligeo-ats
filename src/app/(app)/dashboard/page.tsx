import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { aggregateSources, calcSourcePct, aggregateFunnel, calcTimeToHire } from "@/lib/utils/dashboard";
import { MineToggle } from "./mine-toggle";

export const metadata: Metadata = {
  title: "Dashboard — Eligeo",
};

// ── Metric Card ────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-lg border border-border bg-card p-5 transition-colors hover:bg-card/80">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

// ── Section Header ─────────────────────────────────────────

function SectionHeader({ title, tooltip }: { title: string; tooltip?: string }) {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {tooltip && (
        <span title={tooltip} className="cursor-help text-xs text-muted-foreground/60">ⓘ</span>
      )}
    </div>
  );
}

// ── Status chip ────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    hired: "bg-success/10 text-success",
    rejected: "bg-muted text-muted-foreground",
    withdrawn: "bg-muted text-muted-foreground",
    active: "bg-primary/10 text-primary",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ── Dashboard Page ─────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const supabase = await createClient();
  const cookieStore = await cookies();
  const orgId = session.orgId;
  const params = searchParams ? await searchParams : {};

  // SR6 / R13: "mine" mode — URL param takes precedence, falls back to cookie
  const mineCookie = cookieStore.get("mine_mode")?.value === "1";
  const mineMode = params["mine"] === "1" || (params["mine"] !== "0" && mineCookie);
  const recruiterFilter = mineMode ? session.userId : null;

  // eslint-disable-next-line react-hooks/purity -- Server Component, runs once per request
  const nowMs = new Date().getTime();
  const oneWeekAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const renderTime = new Date(nowMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // SR6: when in mine mode, pre-fetch the recruiter's job IDs for filtering
  let recruiterJobIds: string[] | null = null;
  if (recruiterFilter) {
    const { data: myJobs } = await supabase
      .from("job_openings")
      .select("id")
      .eq("organization_id", orgId)
      .eq("recruiter_id", recruiterFilter)
      .is("deleted_at", null);
    recruiterJobIds = (myJobs ?? []).map((j: { id: string }) => j.id);
  }

  const myJobIds = recruiterJobIds ?? null;
  const noJobs = myJobIds !== null && myJobIds.length === 0;

  // Parallel queries — all org-scoped + soft-delete filtered
  const [
    { count: activeJobs },
    hiresResult,
    { count: activeApplications },
    { count: applicationsThisWeek },
    { data: sourceRows },
    { data: stageRows },
    { data: recentApps },
    { data: defaultTemplateRow },
  ] = await Promise.all([
    // Active jobs
    (() => {
      const q = supabase
        .from("job_openings")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "open")
        .is("deleted_at", null);
      return recruiterFilter ? q.eq("recruiter_id", recruiterFilter) : q;
    })(),

    // R8: Hires this month + avg time-to-hire
    noJobs
      ? Promise.resolve({ data: null, error: null })
      : (() => {
          const q = supabase
            .from("applications")
            .select("applied_at, hired_at")
            .eq("organization_id", orgId)
            .eq("status", "hired")
            .gte("hired_at", startOfMonth)
            .not("hired_at", "is", null)
            .is("deleted_at", null);
          return myJobIds ? q.in("job_opening_id", myJobIds) : q;
        })(),

    // Active applications
    noJobs
      ? Promise.resolve({ count: 0, data: null, error: null })
      : (() => {
          const q = supabase
            .from("applications")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .eq("status", "active")
            .is("deleted_at", null);
          return myJobIds ? q.in("job_opening_id", myJobIds) : q;
        })(),

    // Applications received this week (volume metric, all statuses)
    noJobs
      ? Promise.resolve({ count: 0, data: null, error: null })
      : (() => {
          const q = supabase
            .from("applications")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .gte("applied_at", oneWeekAgo)
            .is("deleted_at", null);
          return myJobIds ? q.in("job_opening_id", myJobIds) : q;
        })(),

    // Source attribution
    noJobs
      ? Promise.resolve({ data: [], error: null })
      : (() => {
          const q = supabase
            .from("applications")
            .select("candidates!inner(source, candidate_sources(name))")
            .eq("organization_id", orgId)
            .eq("status", "active")
            .is("deleted_at", null);
          return myJobIds ? q.in("job_opening_id", myJobIds) : q;
        })(),

    // R11: Current stage distribution (snapshot of active applications by stage)
    noJobs
      ? Promise.resolve({ data: [], error: null })
      : (() => {
          const q = supabase
            .from("applications")
            .select(`
              current_stage_id,
              pipeline_stages!inner(name, stage_order, stage_type, pipeline_template_id)
            `)
            .eq("organization_id", orgId)
            .eq("status", "active")
            .is("deleted_at", null);
          return myJobIds ? q.in("job_opening_id", myJobIds) : q;
        })(),

    // R12: Recent 5 applications — with status + stage name for actionable rows
    noJobs
      ? Promise.resolve({ data: [], error: null })
      : (() => {
          const q = supabase
            .from("applications")
            .select(`
              id, applied_at, status, candidate_id,
              candidates!inner(full_name),
              job_openings!inner(title),
              pipeline_stages:current_stage_id(name)
            `)
            .eq("organization_id", orgId)
            .is("deleted_at", null)
            .order("applied_at", { ascending: false })
            .limit(5);
          return myJobIds ? q.in("job_opening_id", myJobIds) : q;
        })(),

    // Default pipeline template for funnel filter (R3)
    supabase
      .from("pipeline_templates")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_default", true)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  // ── R8: Compute hires count + avg time-to-hire ──────────
  const hiresRows = (hiresResult.data ?? []) as Array<{ applied_at: string; hired_at: string }>;
  const hiresThisMonth = hiresRows.length;
  let avgDays: number | null = null;
  if (hiresRows.length > 0) {
    const total = hiresRows.reduce((sum, r) => {
      const diff = (new Date(r.hired_at).getTime() - new Date(r.applied_at).getTime()) / 86400000;
      return sum + diff;
    }, 0);
    avgDays = total / hiresRows.length;
  }

  // ── Aggregate source data ──────────────────────────────
  const topSources = aggregateSources(sourceRows ?? []);

  // ── Aggregate stage distribution (filtered to default template) ──
  const defaultTemplateId = defaultTemplateRow?.id ?? null;
  const funnelStages = aggregateFunnel(
    (stageRows ?? []) as Parameters<typeof aggregateFunnel>[0],
    defaultTemplateId
  );
  const maxCount = Math.max(1, ...funnelStages.map((s) => s.count));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          {/* R13: data freshness timestamp */}
          <p className="mt-0.5 text-xs text-muted-foreground">as of {renderTime}</p>
        </div>
        {/* R13: Mine mode toggle — reads/sets cookie via client component */}
        <MineToggle mineMode={mineMode} />
      </div>

      {/* ── Top Metrics ── */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Active Jobs"
          value={activeJobs ?? 0}
          sub="published"
          href="/jobs"
        />
        {/* R8: Hires This Month replaces "Candidates in DB" (wrong metric for hiring dashboard) */}
        <MetricCard
          label="Hires"
          value={hiresThisMonth}
          sub={`this month · avg ${calcTimeToHire(avgDays)} to hire`}
          href="/candidates"
        />
        <MetricCard
          label="Active Applications"
          value={activeApplications ?? 0}
          sub="in pipeline"
          href="/candidates"
        />
        <MetricCard
          label="Received"
          value={applicationsThisWeek ?? 0}
          sub="applications this week"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* ── R11: Current Stage Distribution (snapshot, not passthrough funnel) ── */}
        <div>
          <SectionHeader
            title="Current Stage Distribution"
            tooltip="Shows where active candidates are right now. Flow-through funnel (with passthrough rates) available in Phase 3."
          />
          <div className="rounded-lg border border-border bg-card p-5">
            {funnelStages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active applications.</p>
            ) : (
              <div className="space-y-3">
                {funnelStages.map((stage) => (
                  <Link
                    key={stage.name}
                    href={`/candidates?stage=${stage.id}`}
                    className="block hover:opacity-80"
                  >
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium">{stage.name}</span>
                      <span className="tabular-nums text-muted-foreground">{stage.count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.round((stage.count / maxCount) * 100)}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Source Attribution ── */}
        <div>
          <SectionHeader title="Source Attribution" />
          <div className="rounded-lg border border-border bg-card p-5">
            {topSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No source data yet.</p>
            ) : (
              <div className="space-y-2">
                {topSources.map(([source, count]) => {
                  const pct = calcSourcePct(count, topSources[0]?.[1] ?? 1);
                  return (
                    <div key={source} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 truncate font-medium capitalize">{source}</span>
                      <div className="flex-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-8 text-right tabular-nums text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── R12: Recent Applications — with links, stage, status ── */}
      <div className="mt-8">
        <SectionHeader title="Recent Applications" />
        <div className="rounded-lg border border-border bg-card">
          {(recentApps ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No applications yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(recentApps ?? []).map((app) => {
                const candidate = Array.isArray(app.candidates) ? app.candidates[0] : app.candidates;
                const job = Array.isArray(app.job_openings) ? app.job_openings[0] : app.job_openings;
                const stage = Array.isArray(app.pipeline_stages) ? app.pipeline_stages[0] : app.pipeline_stages;
                const c = candidate as { full_name: string } | null;
                const j = job as { title: string } | null;
                const s = stage as { name: string } | null;
                return (
                  <li key={app.id}>
                    <Link
                      href={`/candidates/${app.candidate_id}`}
                      className="flex items-center justify-between px-5 py-3 text-sm hover:bg-muted/30"
                    >
                      <span className="font-medium">{c?.full_name ?? "Unknown"}</span>
                      <span className="hidden text-muted-foreground sm:block">{j?.title ?? "—"}</span>
                      <div className="flex items-center gap-2">
                        {s?.name && (
                          <span className="hidden rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground md:inline">
                            {s.name}
                          </span>
                        )}
                        <StatusChip status={app.status} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(app.applied_at).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
