/**
 * Dashboard aggregation utilities — pure functions, no DB dependency.
 * Extracted for unit testability (dashboard/page.tsx is a Server Component).
 */

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
): { name: string; order: number; count: number }[] {
  const stageCounts: Record<string, { name: string; order: number; count: number }> = {};

  for (const row of stageRows) {
    const stage = Array.isArray(row.pipeline_stages)
      ? row.pipeline_stages[0]
      : row.pipeline_stages;
    if (!stage || !row.current_stage_id) continue;
    if (defaultTemplateId && stage.pipeline_template_id !== defaultTemplateId) continue;
    const key = row.current_stage_id;
    if (!stageCounts[key]) {
      stageCounts[key] = { name: stage.name, order: stage.stage_order, count: 0 };
    }
    stageCounts[key].count++;
  }

  return Object.values(stageCounts).sort((a, b) => a.order - b.order);
}
