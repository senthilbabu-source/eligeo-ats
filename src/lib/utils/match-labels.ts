/**
 * H4-1: Convert raw similarity scores (0–1) into human-readable labels
 * and compute percentile rank within a result set.
 */

export type MatchLabel = "Strong Match" | "Good Match" | "Partial Match" | "Low Fit";

export function getMatchLabel(score: number): MatchLabel {
  if (score >= 0.8) return "Strong Match";
  if (score >= 0.65) return "Good Match";
  if (score >= 0.5) return "Partial Match";
  return "Low Fit";
}

export type MatchLabelVariant = "strong" | "good" | "partial" | "low";

export function getMatchLabelVariant(score: number): MatchLabelVariant {
  if (score >= 0.8) return "strong";
  if (score >= 0.65) return "good";
  if (score >= 0.5) return "partial";
  return "low";
}

/**
 * Compute percentile rank for each item in a sorted-descending list of scores.
 * Returns a Map from index to percentile (0–100).
 * Example: top candidate in 10 results = Top 10%.
 */
export function computePercentiles(
  scores: number[],
): Map<number, number> {
  const result = new Map<number, number>();
  const total = scores.length;
  if (total === 0) return result;

  for (let i = 0; i < total; i++) {
    // Position-based percentile: (rank / total) * 100
    const percentile = Math.round(((i + 1) / total) * 100);
    result.set(i, percentile);
  }

  return result;
}

/**
 * Format a percentile rank as a user-friendly string.
 */
export function formatPercentile(percentile: number): string {
  return `Top ${percentile}%`;
}
