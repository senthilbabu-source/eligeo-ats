import { describe, it, expect } from "vitest";
import { buildScorecardSummaryPrompt } from "@/lib/ai/generate";

describe("buildScorecardSummaryPrompt", () => {
  const baseParams = {
    totalSubmissions: 2,
    recommendations: { strong_yes: 1, yes: 1, no: 0, strong_no: 0 },
    weightedOverall: 4.2,
    categories: [
      {
        name: "Technical Skills",
        weight: 2,
        avgRating: 4.5,
        attributes: [
          {
            name: "System Design",
            avgRating: 4.0,
            ratings: [
              { submitterName: "Alice", rating: 4, notes: "Strong architecture thinking" },
              { submitterName: "Bob", rating: 4, notes: null },
            ],
          },
          {
            name: "Coding",
            avgRating: 5.0,
            ratings: [
              { submitterName: "Alice", rating: 5, notes: null },
              { submitterName: "Bob", rating: 5, notes: "Excellent" },
            ],
          },
        ],
      },
    ],
  };

  it("should include submission count", () => {
    const prompt = buildScorecardSummaryPrompt(baseParams);
    expect(prompt).toContain("2 interviewers");
  });

  it("should include recommendation tally", () => {
    const prompt = buildScorecardSummaryPrompt(baseParams);
    expect(prompt).toContain("1 strong yes");
    expect(prompt).toContain("1 yes");
    expect(prompt).toContain("0 no");
    expect(prompt).toContain("0 strong no");
  });

  it("should include weighted overall score", () => {
    const prompt = buildScorecardSummaryPrompt(baseParams);
    expect(prompt).toContain("4.2 / 5.0");
  });

  it("should omit weighted overall when null", () => {
    const prompt = buildScorecardSummaryPrompt({
      ...baseParams,
      weightedOverall: null,
    });
    expect(prompt).not.toContain("Weighted overall");
  });

  it("should include category headers with weight and avg", () => {
    const prompt = buildScorecardSummaryPrompt(baseParams);
    expect(prompt).toContain("## Technical Skills (weight: 2, avg: 4.5/5)");
  });

  it("should include attribute names and averages", () => {
    const prompt = buildScorecardSummaryPrompt(baseParams);
    expect(prompt).toContain("- System Design: avg 4.0/5");
    expect(prompt).toContain("- Coding: avg 5.0/5");
  });

  it("should include interviewer notes when present", () => {
    const prompt = buildScorecardSummaryPrompt(baseParams);
    expect(prompt).toContain('"Strong architecture thinking"');
    expect(prompt).toContain('"Excellent"');
  });

  it("should handle single submission with singular grammar", () => {
    const prompt = buildScorecardSummaryPrompt({
      ...baseParams,
      totalSubmissions: 1,
    });
    expect(prompt).toContain("1 interviewer.");
    expect(prompt).not.toContain("1 interviewers");
  });

  it("should handle multiple categories", () => {
    const prompt = buildScorecardSummaryPrompt({
      ...baseParams,
      categories: [
        ...baseParams.categories,
        {
          name: "Communication",
          weight: 1,
          avgRating: 3.5,
          attributes: [
            {
              name: "Clarity",
              avgRating: 3.5,
              ratings: [{ submitterName: "Alice", rating: 3, notes: null }],
            },
          ],
        },
      ],
    });
    expect(prompt).toContain("## Technical Skills");
    expect(prompt).toContain("## Communication");
    expect(prompt).toContain("- Clarity: avg 3.5/5");
  });

  it("should handle empty categories array", () => {
    const prompt = buildScorecardSummaryPrompt({
      ...baseParams,
      categories: [],
    });
    expect(prompt).toContain("2 interviewers");
    expect(prompt).not.toContain("##");
  });
});
