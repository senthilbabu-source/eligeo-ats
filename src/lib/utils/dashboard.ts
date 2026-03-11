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
