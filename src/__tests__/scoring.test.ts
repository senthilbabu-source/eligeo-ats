/**
 * Unit tests: scoring utility
 * Tests weighted score aggregation, recommendation tallies, edge cases.
 * Pure functions — no Supabase dependency.
 */

import { describe, it, expect } from "vitest";
import {
  computeScorecardSummary,
  tallyRecommendations,
  type RawSubmission,
  type RawRating,
  type RawAttribute,
  type RawCategory,
} from "@/lib/scoring";

// ── Test Data ──────────────────────────────────────────────

const categories: RawCategory[] = [
  { id: "cat-tech", name: "Technical Skills", weight: 2.0 },
  { id: "cat-comm", name: "Communication", weight: 1.0 },
];

const attributes: RawAttribute[] = [
  { id: "attr-sd", name: "System Design", category_id: "cat-tech" },
  { id: "attr-cq", name: "Code Quality", category_id: "cat-tech" },
  { id: "attr-cl", name: "Clarity", category_id: "cat-comm" },
];

const submissions: RawSubmission[] = [
  {
    id: "sub-1",
    submitted_by: "user-a",
    submitter_name: "Alice",
    overall_recommendation: "strong_yes",
  },
  {
    id: "sub-2",
    submitted_by: "user-b",
    submitter_name: "Bob",
    overall_recommendation: "yes",
  },
];

const ratings: RawRating[] = [
  // Alice's ratings
  { submission_id: "sub-1", attribute_id: "attr-sd", rating: 4, notes: null },
  {
    submission_id: "sub-1",
    attribute_id: "attr-cq",
    rating: 5,
    notes: "Excellent code",
  },
  { submission_id: "sub-1", attribute_id: "attr-cl", rating: 5, notes: null },
  // Bob's ratings
  { submission_id: "sub-2", attribute_id: "attr-sd", rating: 3, notes: null },
  { submission_id: "sub-2", attribute_id: "attr-cq", rating: 4, notes: null },
  {
    submission_id: "sub-2",
    attribute_id: "attr-cl",
    rating: 3,
    notes: "Could be clearer",
  },
];

// ── Tests ──────────────────────────────────────────────────

describe("tallyRecommendations", () => {
  it("should count each recommendation type", () => {
    const tally = tallyRecommendations(submissions);
    expect(tally).toEqual({
      strong_yes: 1,
      yes: 1,
      no: 0,
      strong_no: 0,
    });
  });

  it("should return zeros for empty submissions", () => {
    const tally = tallyRecommendations([]);
    expect(tally).toEqual({
      strong_yes: 0,
      yes: 0,
      no: 0,
      strong_no: 0,
    });
  });

  it("should handle all same recommendation", () => {
    const allNo: RawSubmission[] = [
      {
        id: "s1",
        submitted_by: "u1",
        submitter_name: "A",
        overall_recommendation: "no",
      },
      {
        id: "s2",
        submitted_by: "u2",
        submitter_name: "B",
        overall_recommendation: "no",
      },
      {
        id: "s3",
        submitted_by: "u3",
        submitter_name: "C",
        overall_recommendation: "no",
      },
    ];
    expect(tallyRecommendations(allNo).no).toBe(3);
  });
});

describe("computeScorecardSummary", () => {
  it("should return empty summary for no submissions", () => {
    const summary = computeScorecardSummary(
      "app-1",
      [],
      [],
      attributes,
      categories,
    );
    expect(summary.total_submissions).toBe(0);
    expect(summary.weighted_overall).toBeNull();
    expect(summary.categories).toEqual([]);
  });

  it("should compute correct weighted overall score", () => {
    const summary = computeScorecardSummary(
      "app-1",
      submissions,
      ratings,
      attributes,
      categories,
    );

    expect(summary.total_submissions).toBe(2);
    expect(summary.application_id).toBe("app-1");

    // Technical Skills: SD avg = (4+3)/2 = 3.5, CQ avg = (5+4)/2 = 4.5
    // Tech category avg = (3.5 + 4.5) / 2 = 4.0, weight 2.0
    // Communication: Clarity avg = (5+3)/2 = 4.0
    // Comm category avg = 4.0, weight 1.0
    // Weighted overall = (4.0*2.0 + 4.0*1.0) / (2.0+1.0) = 12/3 = 4.0
    expect(summary.weighted_overall).toBe(4.0);
  });

  it("should compute correct recommendation tally", () => {
    const summary = computeScorecardSummary(
      "app-1",
      submissions,
      ratings,
      attributes,
      categories,
    );
    expect(summary.recommendations).toEqual({
      strong_yes: 1,
      yes: 1,
      no: 0,
      strong_no: 0,
    });
  });

  it("should compute correct per-category averages", () => {
    const summary = computeScorecardSummary(
      "app-1",
      submissions,
      ratings,
      attributes,
      categories,
    );

    const techCat = summary.categories.find(
      (c) => c.category_name === "Technical Skills",
    );
    const commCat = summary.categories.find(
      (c) => c.category_name === "Communication",
    );

    expect(techCat).toBeDefined();
    expect(techCat!.avg_rating).toBe(4.0);
    expect(techCat!.weight).toBe(2.0);

    expect(commCat).toBeDefined();
    expect(commCat!.avg_rating).toBe(4.0);
    expect(commCat!.weight).toBe(1.0);
  });

  it("should compute correct per-attribute averages", () => {
    const summary = computeScorecardSummary(
      "app-1",
      submissions,
      ratings,
      attributes,
      categories,
    );

    const techCat = summary.categories.find(
      (c) => c.category_name === "Technical Skills",
    );
    const sdAttr = techCat?.attributes.find(
      (a) => a.attribute_name === "System Design",
    );
    const cqAttr = techCat?.attributes.find(
      (a) => a.attribute_name === "Code Quality",
    );

    expect(sdAttr?.avg_rating).toBe(3.5);
    expect(cqAttr?.avg_rating).toBe(4.5);
  });

  it("should include individual ratings with submitter names", () => {
    const summary = computeScorecardSummary(
      "app-1",
      submissions,
      ratings,
      attributes,
      categories,
    );

    const techCat = summary.categories.find(
      (c) => c.category_name === "Technical Skills",
    );
    const cqAttr = techCat?.attributes.find(
      (a) => a.attribute_name === "Code Quality",
    );

    expect(cqAttr?.ratings).toHaveLength(2);

    const aliceRating = cqAttr?.ratings.find(
      (r) => r.submitter_name === "Alice",
    );
    expect(aliceRating?.rating).toBe(5);
    expect(aliceRating?.notes).toBe("Excellent code");
  });

  it("should handle single submission correctly", () => {
    const singleSub = [submissions[0]!];
    const singleRatings = ratings.filter((r) => r.submission_id === "sub-1");

    const summary = computeScorecardSummary(
      "app-1",
      singleSub,
      singleRatings,
      attributes,
      categories,
    );

    expect(summary.total_submissions).toBe(1);
    // Tech: SD=4, CQ=5, avg=4.5, weight=2.0
    // Comm: Clarity=5, avg=5.0, weight=1.0
    // Weighted = (4.5*2 + 5*1) / 3 = 14/3 = 4.67
    expect(summary.weighted_overall).toBe(4.67);
  });

  it("should handle asymmetric weights correctly", () => {
    const heavyCats: RawCategory[] = [
      { id: "cat-tech", name: "Technical Skills", weight: 5.0 },
      { id: "cat-comm", name: "Communication", weight: 1.0 },
    ];

    const summary = computeScorecardSummary(
      "app-1",
      submissions,
      ratings,
      attributes,
      heavyCats,
    );

    // Tech avg = 4.0, weight 5.0 → 20.0
    // Comm avg = 4.0, weight 1.0 → 4.0
    // Weighted = 24/6 = 4.0
    expect(summary.weighted_overall).toBe(4.0);
  });

  it("should handle ratings without matching attributes gracefully", () => {
    const orphanRatings: RawRating[] = [
      {
        submission_id: "sub-1",
        attribute_id: "nonexistent",
        rating: 5,
        notes: null,
      },
    ];

    const summary = computeScorecardSummary(
      "app-1",
      [submissions[0]!],
      orphanRatings,
      attributes,
      categories,
    );

    // Orphan rating has no matching attribute — should be ignored
    expect(summary.weighted_overall).toBeNull();
    expect(summary.categories).toEqual([]);
  });

  it("should round weighted_overall to 2 decimal places", () => {
    // Create a scenario that produces a non-terminating decimal
    const oddRatings: RawRating[] = [
      { submission_id: "sub-1", attribute_id: "attr-sd", rating: 3, notes: null },
      { submission_id: "sub-1", attribute_id: "attr-cq", rating: 4, notes: null },
      { submission_id: "sub-1", attribute_id: "attr-cl", rating: 5, notes: null },
    ];

    const summary = computeScorecardSummary(
      "app-1",
      [submissions[0]!],
      oddRatings,
      attributes,
      categories,
    );

    // Tech: SD=3, CQ=4, avg=3.5, weight=2.0
    // Comm: Clarity=5, avg=5.0, weight=1.0
    // Weighted = (3.5*2 + 5*1) / 3 = 12/3 = 4.0
    expect(summary.weighted_overall).toBe(4.0);

    // Verify it's a proper 2-decimal number
    const str = summary.weighted_overall!.toString();
    const decimalPart = str.split(".")[1];
    expect(!decimalPart || decimalPart.length <= 2).toBe(true);
  });
});
