import { describe, it, expect } from "vitest";
import { computeFunnelAnalytics, type RawApplication, type RawStageHistoryRow, type RawStage, type DateRange } from "@/lib/analytics/compute";

const stages: RawStage[] = [
  { id: "s1", name: "Applied", stage_type: "applied", stage_order: 0, pipeline_template_id: "t1" },
  { id: "s2", name: "Screening", stage_type: "screening", stage_order: 1, pipeline_template_id: "t1" },
  { id: "s3", name: "Interview", stage_type: "interview", stage_order: 2, pipeline_template_id: "t1" },
  { id: "s4", name: "Offer", stage_type: "offer", stage_order: 3, pipeline_template_id: "t1" },
];

const dateRange: DateRange = {
  from: new Date("2026-01-01"),
  to: new Date("2026-03-31"),
};

function makeApp(overrides: Partial<RawApplication> = {}): RawApplication {
  return {
    id: "app-1",
    job_opening_id: "j1",
    candidate_id: "c1",
    status: "active",
    current_stage_id: "s2",
    applied_at: "2026-02-01T00:00:00Z",
    hired_at: null,
    rejected_at: null,
    withdrawn_at: null,
    ...overrides,
  };
}

describe("computeFunnelAnalytics", () => {
  it("should compute conversion rates between stages", () => {
    const applications: RawApplication[] = [
      makeApp({ id: "a1", current_stage_id: "s2", status: "active" }),
      makeApp({ id: "a2", current_stage_id: "s3", status: "active" }),
      makeApp({ id: "a3", current_stage_id: "s3", status: "active" }),
    ];
    const stageHistory: RawStageHistoryRow[] = [
      { id: "h1", application_id: "a1", from_stage_id: null, to_stage_id: "s1", created_at: "2026-02-01T00:00:00Z" },
      { id: "h2", application_id: "a1", from_stage_id: "s1", to_stage_id: "s2", created_at: "2026-02-03T00:00:00Z" },
      { id: "h3", application_id: "a2", from_stage_id: null, to_stage_id: "s1", created_at: "2026-02-01T00:00:00Z" },
      { id: "h4", application_id: "a2", from_stage_id: "s1", to_stage_id: "s2", created_at: "2026-02-02T00:00:00Z" },
      { id: "h5", application_id: "a2", from_stage_id: "s2", to_stage_id: "s3", created_at: "2026-02-05T00:00:00Z" },
      { id: "h6", application_id: "a3", from_stage_id: null, to_stage_id: "s1", created_at: "2026-02-01T00:00:00Z" },
      { id: "h7", application_id: "a3", from_stage_id: "s1", to_stage_id: "s3", created_at: "2026-02-04T00:00:00Z" },
    ];

    const result = computeFunnelAnalytics({ applications, stageHistory, stages, dateRange });

    expect(result.totalApplications).toBe(3);
    expect(result.activeApplications).toBe(3);
    expect(result.stages).toHaveLength(4);
    // Applied stage: 3 entered, all exited
    expect(result.stages[0]!.enteredCount).toBe(3);
  });

  it("should handle zero-entry stage", () => {
    const applications: RawApplication[] = [
      makeApp({ id: "a1", current_stage_id: "s1", status: "active" }),
    ];
    const stageHistory: RawStageHistoryRow[] = [
      { id: "h1", application_id: "a1", from_stage_id: null, to_stage_id: "s1", created_at: "2026-02-01T00:00:00Z" },
    ];

    const result = computeFunnelAnalytics({ applications, stageHistory, stages, dateRange });

    // Offer stage should have zero entries
    const offerStage = result.stages.find((s) => s.stageName === "Offer");
    expect(offerStage?.enteredCount).toBe(0);
    expect(offerStage?.conversionRate).toBe(0);
  });

  it("should compute 100% conversion when all exit", () => {
    const applications: RawApplication[] = [
      makeApp({ id: "a1", current_stage_id: "s2", status: "active" }),
    ];
    const stageHistory: RawStageHistoryRow[] = [
      { id: "h1", application_id: "a1", from_stage_id: null, to_stage_id: "s1", created_at: "2026-02-01T00:00:00Z" },
      { id: "h2", application_id: "a1", from_stage_id: "s1", to_stage_id: "s2", created_at: "2026-02-03T00:00:00Z" },
    ];

    const result = computeFunnelAnalytics({ applications, stageHistory, stages, dateRange });
    const appliedStage = result.stages.find((s) => s.stageName === "Applied");
    // 1 entered, 1 exited = conversion rate 1.0
    expect(appliedStage?.conversionRate).toBe(1);
  });

  it("should return empty funnel for empty pipeline", () => {
    const result = computeFunnelAnalytics({
      applications: [],
      stageHistory: [],
      stages,
      dateRange,
    });

    expect(result.totalApplications).toBe(0);
    expect(result.activeApplications).toBe(0);
    expect(result.hiredCount).toBe(0);
    expect(result.overallConversionRate).toBe(0);
  });

  it("should filter by date range", () => {
    const narrowRange: DateRange = {
      from: new Date("2026-03-01"),
      to: new Date("2026-03-31"),
    };
    const applications: RawApplication[] = [
      makeApp({ id: "a1", applied_at: "2026-02-15T00:00:00Z" }), // outside range
      makeApp({ id: "a2", applied_at: "2026-03-15T00:00:00Z" }), // inside range
    ];

    const result = computeFunnelAnalytics({
      applications,
      stageHistory: [],
      stages,
      dateRange: narrowRange,
    });

    expect(result.totalApplications).toBe(1);
  });
});
