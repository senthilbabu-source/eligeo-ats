/**
 * Dashboard aggregation utilities — pure functions, no DB dependency.
 * Extracted for unit testability (dashboard/page.tsx is a Server Component).
 */

/**
 * Format avg time-to-hire (float days) into a human-readable string.
 *
 * The DB query uses EXTRACT(EPOCH FROM (hired_at - applied_at)) / 86400,
 * which returns a float (not a Postgres interval). Returns "—" when no data.
 */
export function calcTimeToHire(avgDays: number | null): string {
  if (avgDays === null || !isFinite(avgDays)) return "—";
  const rounded = Math.round(avgDays);
  return `${rounded} day${rounded !== 1 ? "s" : ""}`;
}

type CandidateSourceRecord = { name: string };

type CandidateSourceRow = {
  source?: string | null;
  // Supabase may return the related row as object or single-element array
  candidate_sources?: CandidateSourceRecord | CandidateSourceRecord[] | null;
};

type SourceRow = {
  candidates: CandidateSourceRow | CandidateSourceRow[] | null;
};

/**
 * Aggregate application source rows into a sorted top-N list.
 *
 * Priority: canonical `candidate_sources.name` (via source_id FK) →
 * fallback to freeform `source` TEXT (legacy records) → "Unknown".
 *
 * Returns entries sorted descending by count, limited to top 5.
 */
export function aggregateSources(sourceRows: SourceRow[]): [string, number][] {
  const counts: Record<string, number> = {};

  for (const row of sourceRows) {
    const candidate = Array.isArray(row.candidates)
      ? row.candidates[0]
      : row.candidates;
    const rawSource = candidate?.candidate_sources;
    const canonicalName = Array.isArray(rawSource)
      ? rawSource[0]?.name
      : rawSource?.name;
    const name = canonicalName ?? candidate?.source ?? "Unknown";
    counts[name] = (counts[name] ?? 0) + 1;
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
}

/**
 * Calculate source bar percentage relative to the top source count.
 * Leading bar always fills to 100%; others scale proportionally.
 */
export function calcSourcePct(count: number, maxCount: number): number {
  return Math.round((count / Math.max(1, maxCount)) * 100);
}

/**
 * Aggregate source quality — volume (active count) + hire rate per source.
 *
 * Hire rate = hired / (active + hired) for that source.
 * Rate is suppressed (null) when total < minCohort (D13 minimum cohort rule).
 *
 * Returns entries sorted descending by active count, limited to top 5.
 */
export function aggregateSourceQuality(
  activeRows: SourceRow[],
  hiredRows: SourceRow[],
  minCohort = 5
): [string, number, number | null][] {
  const activeBySource: Record<string, number> = {};
  const hiredBySource: Record<string, number> = {};

  function resolveName(row: SourceRow): string {
    const candidate = Array.isArray(row.candidates) ? row.candidates[0] : row.candidates;
    const rawSource = candidate?.candidate_sources;
    const canonicalName = Array.isArray(rawSource) ? rawSource[0]?.name : rawSource?.name;
    return canonicalName ?? candidate?.source ?? "Unknown";
  }

  for (const row of activeRows) {
    const name = resolveName(row);
    activeBySource[name] = (activeBySource[name] ?? 0) + 1;
  }
  for (const row of hiredRows) {
    const name = resolveName(row);
    hiredBySource[name] = (hiredBySource[name] ?? 0) + 1;
  }

  const allSources = new Set([...Object.keys(activeBySource), ...Object.keys(hiredBySource)]);

  return Array.from(allSources)
    .map((source): [string, number, number | null] => {
      const active = activeBySource[source] ?? 0;
      const hired = hiredBySource[source] ?? 0;
      const total = active + hired;
      const hireRate = total >= minCohort ? Math.round((hired / total) * 100) : null;
      return [source, active, hireRate];
    })
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
}

export type AtRiskJob = {
  id: string;
  title: string;
  daysOpen: number;
  activeCount: number;
};

type OpenJobRow = {
  id: string;
  title: string;
  published_at: string | null;
  created_at: string;
};

/**
 * Identify at-risk jobs: open ≥21 days AND <3 active applications AND no new app in last 7 days.
 *
 * Returns results sorted descending by daysOpen (most neglected first).
 */
export function findAtRiskJobs(
  jobs: OpenJobRow[],
  activeCountByJobId: Record<string, number>,
  lastAppliedByJobId: Record<string, string | null>,
  nowMs: number
): AtRiskJob[] {
  const MS_PER_DAY = 86400000;
  const AT_RISK_DAYS = 21;
  const AT_RISK_MAX_APPS = 3;
  const AT_RISK_NO_APP_DAYS = 7;

  return jobs
    .filter((job) => {
      const openedAt = job.published_at ?? job.created_at;
      const daysOpen = (nowMs - new Date(openedAt).getTime()) / MS_PER_DAY;
      const activeCount = activeCountByJobId[job.id] ?? 0;
      const lastApplied = lastAppliedByJobId[job.id] ?? null;
      const daysSinceLastApp = lastApplied
        ? (nowMs - new Date(lastApplied).getTime()) / MS_PER_DAY
        : Infinity;
      return daysOpen >= AT_RISK_DAYS && activeCount < AT_RISK_MAX_APPS && daysSinceLastApp > AT_RISK_NO_APP_DAYS;
    })
    .map((job) => {
      const openedAt = job.published_at ?? job.created_at;
      return {
        id: job.id,
        title: job.title,
        daysOpen: Math.floor((nowMs - new Date(openedAt).getTime()) / MS_PER_DAY),
        activeCount: activeCountByJobId[job.id] ?? 0,
      };
    })
    .sort((a, b) => b.daysOpen - a.daysOpen);
}

type StageRow = {
  current_stage_id: string | null;
  pipeline_stages:
    | {
        name: string;
        stage_order: number;
        stage_type: string;
        pipeline_template_id: string;
      }
    | {
        name: string;
        stage_order: number;
        stage_type: string;
        pipeline_template_id: string;
      }[]
    | null;
};

/**
 * Aggregate application stage rows into a sorted funnel array.
 *
 * If `defaultTemplateId` is provided, only stages belonging to that template
 * are included — prevents duplicate bars in multi-template orgs (R3).
 * If null, all stages are included (single-template org fallback).
 *
 * Returns stages sorted by `stage_order` ascending.
 */
export function aggregateFunnel(
  stageRows: StageRow[],
  defaultTemplateId: string | null
): { id: string; name: string; order: number; count: number }[] {
  const stageCounts: Record<string, { id: string; name: string; order: number; count: number }> = {};

  for (const row of stageRows) {
    const stage = Array.isArray(row.pipeline_stages)
      ? row.pipeline_stages[0]
      : row.pipeline_stages;
    if (!stage || !row.current_stage_id) continue;
    if (defaultTemplateId && stage.pipeline_template_id !== defaultTemplateId) continue;
    const key = row.current_stage_id;
    if (!stageCounts[key]) {
      stageCounts[key] = { id: row.current_stage_id, name: stage.name, order: stage.stage_order, count: 0 };
    }
    stageCounts[key].count++;
  }

  return Object.values(stageCounts).sort((a, b) => a.order - b.order);
}
