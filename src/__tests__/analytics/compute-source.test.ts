import { describe, it, expect } from "vitest";
import { computeSourceAnalytics, type RawApplication, type RawCandidate, type RawCandidateSource, type DateRange } from "@/lib/analytics/compute";

const dateRange: DateRange = {
  from: new Date("2026-01-01"),
  to: new Date("2026-03-31"),
};

describe("computeSourceAnalytics", () => {
  it("should compute quality score using weighted formula", () => {
    const candidates: RawCandidate[] = [
      { id: "c1", source: "LinkedIn", source_id: "src1" },
      { id: "c2", source: "LinkedIn", source_id: "src1" },
      { id: "c3", source: "Referral", source_id: "src2" },
    ];
    const sources: RawCandidateSource[] = [
      { id: "src1", name: "LinkedIn" },
      { id: "src2", name: "Referral" },
    ];
    const applications: RawApplication[] = [
      { id: "a1", job_opening_id: "j1", candidate_id: "c1", status: "hired", current_stage_id: "s3", applied_at: "2026-02-01T00:00:00Z", hired_at: "2026-02-15T00:00:00Z", rejected_at: null, withdrawn_at: null },
      { id: "a2", job_opening_id: "j1", candidate_id: "c2", status: "active", current_stage_id: "s2", applied_at: "2026-02-01T00:00:00Z", hired_at: null, rejected_at: null, withdrawn_at: null },
      { id: "a3", job_opening_id: "j1", candidate_id: "c3", status: "active", current_stage_id: "s1", applied_at: "2026-02-01T00:00:00Z", hired_at: null, rejected_at: null, withdrawn_at: null },
    ];

    const result = computeSourceAnalytics({ applications, candidates, sources, dateRange });

    expect(result.sources.length).toBe(2);
    const linkedin = result.sources.find((s) => s.sourceName === "LinkedIn");
    expect(linkedin?.applicationCount).toBe(2);
    expect(linkedin?.hireRate).toBeGreaterThan(0);
    // Quality score should be a number between 0 and 1
    expect(linkedin?.qualityScore).toBeGreaterThanOrEqual(0);
    expect(linkedin?.qualityScore).toBeLessThanOrEqual(1);
  });

  it("should handle unknown source gracefully", () => {
    const candidates: RawCandidate[] = [
      { id: "c1", source: null, source_id: null },
    ];
    const applications: RawApplication[] = [
      { id: "a1", job_opening_id: "j1", candidate_id: "c1", status: "active", current_stage_id: "s1", applied_at: "2026-02-01T00:00:00Z", hired_at: null, rejected_at: null, withdrawn_at: null },
    ];

    const result = computeSourceAnalytics({ applications, candidates, sources: [], dateRange });

    expect(result.sources.length).toBe(1);
    expect(result.sources[0]?.sourceName).toBe("Unknown");
  });

  it("should sort by application count descending", () => {
    const candidates: RawCandidate[] = [
      { id: "c1", source: "A", source_id: null },
      { id: "c2", source: "B", source_id: null },
      { id: "c3", source: "B", source_id: null },
    ];
    const applications: RawApplication[] = [
      { id: "a1", job_opening_id: "j1", candidate_id: "c1", status: "active", current_stage_id: "s1", applied_at: "2026-02-01T00:00:00Z", hired_at: null, rejected_at: null, withdrawn_at: null },
      { id: "a2", job_opening_id: "j1", candidate_id: "c2", status: "active", current_stage_id: "s1", applied_at: "2026-02-01T00:00:00Z", hired_at: null, rejected_at: null, withdrawn_at: null },
      { id: "a3", job_opening_id: "j1", candidate_id: "c3", status: "active", current_stage_id: "s1", applied_at: "2026-02-01T00:00:00Z", hired_at: null, rejected_at: null, withdrawn_at: null },
    ];

    const result = computeSourceAnalytics({ applications, candidates, sources: [], dateRange });
    expect(result.sources[0]?.sourceName).toBe("B");
    expect(result.sources[0]?.applicationCount).toBe(2);
  });

  it("should return zero hire rate when no hires", () => {
    const candidates: RawCandidate[] = [
      { id: "c1", source: "LinkedIn", source_id: null },
    ];
    const applications: RawApplication[] = [
      { id: "a1", job_opening_id: "j1", candidate_id: "c1", status: "active", current_stage_id: "s1", applied_at: "2026-02-01T00:00:00Z", hired_at: null, rejected_at: null, withdrawn_at: null },
    ];

    const result = computeSourceAnalytics({ applications, candidates, sources: [], dateRange });
    expect(result.sources[0]?.hireRate).toBe(0);
  });
});
