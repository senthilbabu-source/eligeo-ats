import { describe, it, expect } from "vitest";
import { aggregateSources, calcSourcePct, aggregateFunnel, calcTimeToHire, aggregateSourceQuality, findAtRiskJobs } from "@/lib/utils/dashboard";
import { isBriefingContent } from "@/inngest/functions/analytics/generate-briefing";

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

describe("calcTimeToHire", () => {
  it("should format whole days correctly", () => {
    expect(calcTimeToHire(14)).toBe("14 days");
  });

  it("should use singular 'day' for exactly 1 day", () => {
    expect(calcTimeToHire(1)).toBe("1 day");
  });

  it("should round fractional days", () => {
    expect(calcTimeToHire(14.6)).toBe("15 days");
    expect(calcTimeToHire(14.4)).toBe("14 days");
  });

  it("should return '—' when null (no hires yet)", () => {
    expect(calcTimeToHire(null)).toBe("—");
  });

  it("should return '—' for non-finite values", () => {
    expect(calcTimeToHire(NaN)).toBe("—");
    expect(calcTimeToHire(Infinity)).toBe("—");
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
    expect(result.at(0)?.id).toBe("s1");
  });

  it("should include stage id in each result for dashboard bar links", () => {
    const rows = [makeRow("s1", "Applied", 1, TEMPLATE_A)];
    const result = aggregateFunnel(rows, TEMPLATE_A);
    expect(result.at(0)?.id).toBe("s1");
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

// ── helpers for source quality tests ────────────────────────

function makeSourceRow(source: string, canonicalName?: string) {
  return {
    candidates: {
      source,
      candidate_sources: canonicalName ? { name: canonicalName } : null,
    },
  };
}

describe("aggregateSourceQuality", () => {
  it("should return active count and hire rate when cohort is met", () => {
    const active = [
      makeSourceRow("linkedin", "LinkedIn"),
      makeSourceRow("linkedin", "LinkedIn"),
      makeSourceRow("linkedin", "LinkedIn"),
    ];
    const hired = [
      makeSourceRow("linkedin", "LinkedIn"),
      makeSourceRow("linkedin", "LinkedIn"),
    ];
    // total = 3 active + 2 hired = 5 → meets minCohort=5
    // hire rate = 2/5 = 40%
    const result = aggregateSourceQuality(active, hired, 5);
    expect(result.at(0)?.[0]).toBe("LinkedIn");
    expect(result.at(0)?.[1]).toBe(3); // active count
    expect(result.at(0)?.[2]).toBe(40); // hire rate %
  });

  it("should suppress hire rate (null) when cohort is below minimum", () => {
    const active = [makeSourceRow("indeed", "Indeed"), makeSourceRow("indeed", "Indeed")];
    const hired = [makeSourceRow("indeed", "Indeed")];
    // total = 2 + 1 = 3 < minCohort=5 → rate suppressed
    const result = aggregateSourceQuality(active, hired, 5);
    expect(result.at(0)?.[2]).toBeNull();
  });

  it("should use canonical name from candidate_sources.name", () => {
    const active = [
      makeSourceRow("linked in", "LinkedIn"),
      makeSourceRow("linkedin", "LinkedIn"),
    ];
    const hired: ReturnType<typeof makeSourceRow>[] = [];
    const result = aggregateSourceQuality(active, hired, 5);
    expect(result.at(0)?.[0]).toBe("LinkedIn");
  });

  it("should fall back to source TEXT when candidate_sources is null", () => {
    const active = [makeSourceRow("Referral"), makeSourceRow("Referral")];
    const hired: ReturnType<typeof makeSourceRow>[] = [];
    const result = aggregateSourceQuality(active, hired, 5);
    expect(result.at(0)?.[0]).toBe("Referral");
  });

  it("should return 0% hire rate (not null) when total meets cohort but no hires", () => {
    const active = [
      makeSourceRow("website", "Website"),
      makeSourceRow("website", "Website"),
      makeSourceRow("website", "Website"),
      makeSourceRow("website", "Website"),
      makeSourceRow("website", "Website"),
    ];
    const hired: ReturnType<typeof makeSourceRow>[] = [];
    // total = 5 = minCohort → rate should be 0%, not null
    const result = aggregateSourceQuality(active, hired, 5);
    expect(result.at(0)?.[2]).toBe(0);
  });

  it("should sort by active count descending", () => {
    const active = [
      makeSourceRow("indeed", "Indeed"),
      makeSourceRow("linkedin", "LinkedIn"),
      makeSourceRow("linkedin", "LinkedIn"),
    ];
    const hired: ReturnType<typeof makeSourceRow>[] = [];
    const result = aggregateSourceQuality(active, hired, 5);
    expect(result.at(0)?.[0]).toBe("LinkedIn"); // 2 active
    expect(result.at(1)?.[0]).toBe("Indeed");   // 1 active
  });
});

describe("findAtRiskJobs", () => {
  const NOW = new Date("2026-03-11T12:00:00Z").getTime();

  function daysAgo(n: number): string {
    return new Date(NOW - n * 86400000).toISOString();
  }

  function makeJob(id: string, publishedDaysAgo: number | null, createdDaysAgo = 30) {
    return {
      id,
      title: `Job ${id}`,
      published_at: publishedDaysAgo !== null ? daysAgo(publishedDaysAgo) : null,
      created_at: daysAgo(createdDaysAgo),
    };
  }

  it("should flag a job open ≥21 days with 0 active apps and no recent app", () => {
    const jobs = [makeJob("j1", 25)];
    const result = findAtRiskJobs(jobs, {}, {}, NOW);
    expect(result).toHaveLength(1);
    expect(result.at(0)?.id).toBe("j1");
    expect(result.at(0)?.daysOpen).toBe(25);
  });

  it("should NOT flag a job with ≥3 active applications", () => {
    const jobs = [makeJob("j1", 25)];
    const result = findAtRiskJobs(jobs, { j1: 3 }, {}, NOW);
    expect(result).toHaveLength(0);
  });

  it("should NOT flag a job with a new application within last 7 days", () => {
    const jobs = [makeJob("j1", 25)];
    const result = findAtRiskJobs(jobs, {}, { j1: daysAgo(5) }, NOW);
    expect(result).toHaveLength(0);
  });

  it("should NOT flag a job open <21 days", () => {
    const jobs = [makeJob("j1", 15)];
    const result = findAtRiskJobs(jobs, {}, {}, NOW);
    expect(result).toHaveLength(0);
  });

  it("should fall back to created_at when published_at is null", () => {
    const jobs = [makeJob("j1", null, 25)]; // created 25 days ago, never published
    const result = findAtRiskJobs(jobs, {}, {}, NOW);
    expect(result).toHaveLength(1);
    expect(result.at(0)?.daysOpen).toBe(25);
  });

  it("should sort by daysOpen descending (most neglected first)", () => {
    const jobs = [makeJob("j1", 22), makeJob("j2", 35)];
    const result = findAtRiskJobs(jobs, {}, {}, NOW);
    expect(result.at(0)?.id).toBe("j2");
    expect(result.at(1)?.id).toBe("j1");
  });

  it("should return empty array when all jobs are healthy", () => {
    const jobs = [makeJob("j1", 25), makeJob("j2", 30)];
    // both have 3+ apps
    const result = findAtRiskJobs(jobs, { j1: 5, j2: 4 }, {}, NOW);
    expect(result).toHaveLength(0);
  });
});

describe("isBriefingContent", () => {
  it("should return true for valid briefing content", () => {
    expect(isBriefingContent({ win: "3 hires", blocker: "Backlog", action: "Schedule interviews" })).toBe(true);
  });

  it("should return false when a required field is missing", () => {
    expect(isBriefingContent({ win: "3 hires", blocker: "Backlog" })).toBe(false);
  });

  it("should return false for non-string field values", () => {
    expect(isBriefingContent({ win: 42, blocker: "Backlog", action: "Do it" })).toBe(false);
  });

  it("should return false for null", () => {
    expect(isBriefingContent(null)).toBe(false);
  });
});
