import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { aggregateSources, calcSourcePct, aggregateFunnel } from "@/lib/utils/dashboard";

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

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </h2>
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
  const orgId = session.orgId;
  const params = searchParams ? await searchParams : {};
  // SR6: "mine" mode — filter to jobs where recruiter_id = current user
  const mineMode = params["mine"] === "1";
  const recruiterFilter = mineMode ? session.userId : null;
  // eslint-disable-next-line react-hooks/purity -- Server Component, runs once per request
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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

  // SR6: when in mine mode, restrict to these job IDs (empty guard prevents full table scan)
  const myJobIds = recruiterJobIds ?? null;
  const noJobs = myJobIds !== null && myJobIds.length === 0;

  // Parallel queries — all org-scoped + soft-delete filtered
  const [
    { count: activeJobs },
    { count: totalCandidates },
    { count: activeApplications },
    { count: applicationsThisWeek },
    { data: sourceRows },
    { data: stageRows },
    { data: recentApps },
    { data: defaultTemplateRow },
  ] = await Promise.all([
    // Active jobs — status "open" is the only valid published state (schema CHECK constraint)
    // SR6: in mine mode, filter by recruiter_id directly on job_openings
    (() => {
      const q = supabase
        .from("job_openings")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "open")
        .is("deleted_at", null);
      return recruiterFilter ? q.eq("recruiter_id", recruiterFilter) : q;
    })(),

    // Total candidates — always org-wide (not scoped to recruiter)
    supabase
      .from("candidates")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("deleted_at", null),

    // Active applications — scoped to recruiter's jobs in mine mode
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

    // Applications received this week — all statuses (volume metric, not state metric).
    // Label on the card is "Received" / "applications this week" to reflect this accurately.
    // Scoped to recruiter's jobs in mine mode.
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

    // Source attribution — canonical name via source_id FK, fallback to freeform source TEXT
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

    // Pipeline funnel — applications per stage (with template_id for R3 filter)
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

    // Recent 5 applications — scoped to recruiter's jobs in mine mode
    noJobs
      ? Promise.resolve({ data: [], error: null })
      : (() => {
          const q = supabase
            .from("applications")
            .select(`
              id, applied_at,
              candidates!inner(full_name),
              job_openings!inner(title)
            `)
            .eq("organization_id", orgId)
            .is("deleted_at", null)
            .order("applied_at", { ascending: false })
            .limit(5);
          return myJobIds ? q.in("job_opening_id", myJobIds) : q;
        })(),

    // Default pipeline template for this org (R3 funnel filter)
    supabase
      .from("pipeline_templates")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_default", true)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  // ── Aggregate source data ──────────────────────────────
  const topSources = aggregateSources(sourceRows ?? []);

  // ── Aggregate pipeline funnel (filtered to default template) ──
  const defaultTemplateId = defaultTemplateRow?.id ?? null;
  const funnelStages = aggregateFunnel(
    // Supabase infers a wider union type for the joined columns; cast to the shape aggregateFunnel expects
    (stageRows ?? []) as Parameters<typeof aggregateFunnel>[0],
    defaultTemplateId
  );
  const maxCount = Math.max(1, ...funnelStages.map((s) => s.count));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        {/* SR6 — Recruiter personalization toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1 text-sm">
          <Link
            href="/dashboard"
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${!mineMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            All Jobs
          </Link>
          <Link
            href="/dashboard?mine=1"
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mineMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            My Jobs
          </Link>
        </div>
      </div>

      {/* ── Top Metrics ── */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Active Jobs"
          value={activeJobs ?? 0}
          sub="published"
          href="/jobs"
        />
        <MetricCard
          label="Candidates"
          value={totalCandidates ?? 0}
          sub="in database"
          href="/candidates"
        />
        <MetricCard
          label="Active Applications"
          value={activeApplications ?? 0}
          sub="in pipeline"
        />
        <MetricCard
          label="Received"
          value={applicationsThisWeek ?? 0}
          sub="applications this week"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* ── Pipeline Funnel ── */}
        <div>
          <SectionHeader title="Pipeline Funnel" />
          <div className="rounded-lg border border-border bg-card p-5">
            {funnelStages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active applications.</p>
            ) : (
              <div className="space-y-3">
                {funnelStages.map((stage) => (
                  <div key={stage.name}>
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
                  </div>
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

      {/* ── Recent Applications ── */}
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
                const c = candidate as { full_name: string } | null;
                const j = job as { title: string } | null;
                return (
                  <li key={app.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="font-medium">{c?.full_name ?? "Unknown"}</span>
                    <span className="text-muted-foreground">{j?.title ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(app.applied_at).toLocaleDateString()}
                    </span>
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
