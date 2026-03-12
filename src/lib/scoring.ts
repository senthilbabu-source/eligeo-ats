/**
 * Scorecard scoring utilities — pure functions for weighted score aggregation.
 * D07 §4.3 — weighted average across categories, recommendation tallies.
 *
 * Formula: weighted_overall = SUM(rating * category_weight) / SUM(category_weight)
 * Each category's avg_rating = mean of its attribute ratings within a submission,
 * then averaged across submissions.
 */

import type {
  OverallRecommendation,
  RecommendationTally,
  CategorySummary,
  AttributeSummary,
  ScorecardSummary,
} from "@/lib/types/ground-truth";

// ── Input types (raw DB rows) ─────────────────────────────

export interface RawSubmission {
  id: string;
  submitted_by: string;
  submitter_name: string;
  overall_recommendation: OverallRecommendation;
}

export interface RawRating {
  submission_id: string;
  attribute_id: string;
  rating: number;
  notes: string | null;
}

export interface RawAttribute {
  id: string;
  name: string;
  category_id: string;
}

export interface RawCategory {
  id: string;
  name: string;
  weight: number;
}

// ── Recommendation Tally ──────────────────────────────────

export function tallyRecommendations(
  submissions: RawSubmission[],
): RecommendationTally {
  const tally: RecommendationTally = {
    strong_yes: 0,
    yes: 0,
    no: 0,
    strong_no: 0,
  };
  for (const s of submissions) {
    tally[s.overall_recommendation]++;
  }
  return tally;
}

// ── Weighted Score Aggregation ─────────────────────────────

/**
 * Compute the full scorecard summary for an application.
 *
 * Algorithm:
 * 1. Group ratings by attribute, compute per-attribute average across submissions
 * 2. Group attributes by category, compute per-category average (mean of attribute avgs)
 * 3. Compute weighted overall = SUM(category_avg * weight) / SUM(weight)
 */
export function computeScorecardSummary(
  applicationId: string,
  submissions: RawSubmission[],
  ratings: RawRating[],
  attributes: RawAttribute[],
  categories: RawCategory[],
): ScorecardSummary {
  if (submissions.length === 0) {
    return {
      application_id: applicationId,
      total_submissions: 0,
      recommendations: { strong_yes: 0, yes: 0, no: 0, strong_no: 0 },
      weighted_overall: null,
      categories: [],
    };
  }

  const recommendations = tallyRecommendations(submissions);

  // Build lookup maps
  const attrMap = new Map(attributes.map((a) => [a.id, a]));
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const submitterMap = new Map(
    submissions.map((s) => [s.id, s.submitter_name]),
  );

  // Group ratings by attribute_id
  const ratingsByAttr = new Map<string, RawRating[]>();
  for (const r of ratings) {
    const existing = ratingsByAttr.get(r.attribute_id) ?? [];
    existing.push(r);
    ratingsByAttr.set(r.attribute_id, existing);
  }

  // Build attribute summaries
  const attrSummaries = new Map<string, AttributeSummary>();
  for (const [attrId, attrRatings] of ratingsByAttr) {
    const attr = attrMap.get(attrId);
    if (!attr) continue;

    const sum = attrRatings.reduce((acc, r) => acc + r.rating, 0);
    const avg = sum / attrRatings.length;

    attrSummaries.set(attrId, {
      attribute_id: attrId,
      attribute_name: attr.name,
      avg_rating: round2(avg),
      ratings: attrRatings.map((r) => ({
        submission_id: r.submission_id,
        submitter_name: submitterMap.get(r.submission_id) ?? "Unknown",
        rating: r.rating,
        notes: r.notes,
      })),
    });
  }

  // Group attribute summaries by category
  const attrsByCat = new Map<string, AttributeSummary[]>();
  for (const [attrId, summary] of attrSummaries) {
    const attr = attrMap.get(attrId);
    if (!attr) continue;
    const existing = attrsByCat.get(attr.category_id) ?? [];
    existing.push(summary);
    attrsByCat.set(attr.category_id, existing);
  }

  // Build category summaries with weighted scoring
  const categorySummaries: CategorySummary[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [catId, catAttrs] of attrsByCat) {
    const cat = catMap.get(catId);
    if (!cat) continue;

    // Category avg = mean of its attribute averages
    const catAvg =
      catAttrs.reduce((acc, a) => acc + a.avg_rating, 0) / catAttrs.length;

    categorySummaries.push({
      category_id: catId,
      category_name: cat.name,
      weight: cat.weight,
      avg_rating: round2(catAvg),
      attributes: catAttrs,
    });

    weightedSum += catAvg * cat.weight;
    totalWeight += cat.weight;
  }

  const weightedOverall = totalWeight > 0 ? weightedSum / totalWeight : null;

  return {
    application_id: applicationId,
    total_submissions: submissions.length,
    recommendations,
    weighted_overall: weightedOverall !== null ? round2(weightedOverall) : null,
    categories: categorySummaries,
  };
}

/** Round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
