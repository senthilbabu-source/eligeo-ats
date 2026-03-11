import { describe, it, expect } from "vitest";
import { aggregateSources, calcSourcePct, aggregateFunnel } from "@/lib/utils/dashboard";

describe("aggregateSources", () => {
  it("should use candidate_sources.name (canonical) when source_id is set", () => {
    const rows = [
      { candidates: { source: "linkedin", candidate_sources: { name: "LinkedIn" } } },
      { candidates: { source: "linked in", candidate_sources: { name: "LinkedIn" } } },
      { candidates: { source: "indeed", candidate_sources: { name: "Indeed" } } },
    ];

    const result = aggregateSources(rows);

    // Both "linkedin" and "linked in" raw values resolve to canonical "LinkedIn"
    expect(result[0]).toEqual(["LinkedIn", 2]);
    expect(result[1]).toEqual(["Indeed", 1]);
  });

  it("should fall back to source TEXT when candidate_sources is null (legacy records)", () => {
    const rows = [
      { candidates: { source: "Referral", candidate_sources: null } },
      { candidates: { source: "Referral", candidate_sources: null } },
      { candidates: { source: "Website", candidate_sources: null } },
    ];

    const result = aggregateSources(rows);

    expect(result[0]).toEqual(["Referral", 2]);
    expect(result[1]).toEqual(["Website", 1]);
  });

  it("should return 'Unknown' when both source and candidate_sources are null", () => {
    const rows = [
      { candidates: { source: null, candidate_sources: null } },
      { candidates: null },
    ];

    const result = aggregateSources(rows);

    expect(result).toEqual([["Unknown", 2]]);
  });
});

describe("calcSourcePct", () => {
  it("should return 100 for the top source (count equals max)", () => {
    expect(calcSourcePct(10, 10)).toBe(100);
  });

  it("should scale proportionally relative to max", () => {
    expect(calcSourcePct(5, 10)).toBe(50);
  });

  it("should guard against zero denominator", () => {
    expect(calcSourcePct(0, 0)).toBe(0);
  });
});

describe("aggregateFunnel", () => {
  const TEMPLATE_A = "tpl-a-uuid";
  const TEMPLATE_B = "tpl-b-uuid";

  const makeRow = (
    stageId: string,
    name: string,
    order: number,
    templateId: string
  ) => ({
    current_stage_id: stageId,
    pipeline_stages: {
      name,
      stage_order: order,
      stage_type: "standard",
      pipeline_template_id: templateId,
    },
  });

  it("should include all stages when defaultTemplateId is null", () => {
    const rows = [
      makeRow("s1", "Applied", 1, TEMPLATE_A),
      makeRow("s2", "Phone Screen", 2, TEMPLATE_B),
    ];
    const result = aggregateFunnel(rows, null);
    expect(result).toHaveLength(2);
  });

  it("should filter to default template stages only", () => {
    const rows = [
      makeRow("s1", "Applied", 1, TEMPLATE_A),
      makeRow("s2", "Phone Screen", 2, TEMPLATE_B),
    ];
    const result = aggregateFunnel(rows, TEMPLATE_A);
    expect(result).toHaveLength(1);
    expect(result.at(0)?.name).toBe("Applied");
  });

  it("should aggregate multiple applications in the same stage", () => {
    const rows = [
      makeRow("s1", "Applied", 1, TEMPLATE_A),
      makeRow("s1", "Applied", 1, TEMPLATE_A),
    ];
    const result = aggregateFunnel(rows, TEMPLATE_A);
    expect(result.at(0)?.count).toBe(2);
  });

  it("should sort by stage_order ascending", () => {
    const rows = [
      makeRow("s2", "Interview", 2, TEMPLATE_A),
      makeRow("s1", "Applied", 1, TEMPLATE_A),
    ];
    const result = aggregateFunnel(rows, TEMPLATE_A);
    expect(result.at(0)?.name).toBe("Applied");
    expect(result.at(1)?.name).toBe("Interview");
  });
});
