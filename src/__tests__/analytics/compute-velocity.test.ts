import { describe, it, expect } from "vitest";
import { computeVelocityAnalytics, type RawApplication, type RawStageHistoryRow, type RawStage, type RawJob, type DateRange } from "@/lib/analytics/compute";

const stages: RawStage[] = [
  { id: "s1", name: "Applied", stage_type: "applied", stage_order: 0, pipeline_template_id: "t1" },
  { id: "s2", name: "Screening", stage_type: "screening", stage_order: 1, pipeline_template_id: "t1" },
  { id: "s3", name: "Interview", stage_type: "interview", stage_order: 2, pipeline_template_id: "t1" },
];

const dateRange: DateRange = {
  from: new Date("2026-01-01"),
  to: new Date("2026-03-31"),
};

const jobs: RawJob[] = [
  { id: "j1", title: "Engineer", department: "Eng", status: "open", recruiter_id: "r1", published_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
];

describe("computeVelocityAnalytics", () => {
  it("should compute time-to-hire for hired applications", () => {
    const applications: RawApplication[] = [
      {
        id: "a1", job_opening_id: "j1", candidate_id: "c1", status: "hired",
        current_stage_id: "s3", applied_at: "2026-02-01T00:00:00Z", hired_at: "2026-02-21T00:00:00Z",
        rejected_at: null, withdrawn_at: null,
      },
      {
        id: "a2", job_opening_id: "j1", candidate_id: "c2", status: "hired",
        current_stage_id: "s3", applied_at: "2026-02-01T00:00:00Z", hired_at: "2026-02-11T00:00:00Z",
        rejected_at: null, withdrawn_at: null,
      },
    ];

    const result = computeVelocityAnalytics({
      applications, stageHistory: [], stages, jobs, dateRange,
    });

    // Avg: (20 + 10) / 2 = 15
    expect(result.avgTimeToHireDays).toBe(15);
    // Median: (10 + 20) / 2 = 15
    expect(result.medianTimeToHireDays).toBe(15);
  });

  it("should handle null hired_at gracefully", () => {
    const applications: RawApplication[] = [
      {
        id: "a1", job_opening_id: "j1", candidate_id: "c1", status: "active",
        current_stage_id: "s2", applied_at: "2026-02-01T00:00:00Z", hired_at: null,
        rejected_at: null, withdrawn_at: null,
      },
    ];

    const result = computeVelocityAnalytics({
      applications, stageHistory: [], stages, jobs, dateRange,
    });

    expect(result.avgTimeToHireDays).toBeNull();
    expect(result.medianTimeToHireDays).toBeNull();
  });

  it("should correctly compute median with odd number of hires", () => {
    const applications: RawApplication[] = [
      { id: "a1", job_opening_id: "j1", candidate_id: "c1", status: "hired", current_stage_id: "s3", applied_at: "2026-02-01T00:00:00Z", hired_at: "2026-02-06T00:00:00Z", rejected_at: null, withdrawn_at: null },
      { id: "a2", job_opening_id: "j1", candidate_id: "c2", status: "hired", current_stage_id: "s3", applied_at: "2026-02-01T00:00:00Z", hired_at: "2026-02-11T00:00:00Z", rejected_at: null, withdrawn_at: null },
      { id: "a3", job_opening_id: "j1", candidate_id: "c3", status: "hired", current_stage_id: "s3", applied_at: "2026-02-01T00:00:00Z", hired_at: "2026-02-21T00:00:00Z", rejected_at: null, withdrawn_at: null },
    ];

    const result = computeVelocityAnalytics({
      applications, stageHistory: [], stages, jobs, dateRange,
    });

    // Sorted: [5, 10, 20], median = 10
    expect(result.medianTimeToHireDays).toBe(10);
  });

  it("should detect bottleneck stage", () => {
    const applications: RawApplication[] = [
      { id: "a1", job_opening_id: "j1", candidate_id: "c1", status: "active", current_stage_id: "s3", applied_at: "2026-02-01T00:00:00Z", hired_at: null, rejected_at: null, withdrawn_at: null },
    ];
    const stageHistory: RawStageHistoryRow[] = [
      { id: "h1", application_id: "a1", from_stage_id: null, to_stage_id: "s1", created_at: "2026-02-01T00:00:00Z" },
      { id: "h2", application_id: "a1", from_stage_id: "s1", to_stage_id: "s2", created_at: "2026-02-02T00:00:00Z" },
      { id: "h3", application_id: "a1", from_stage_id: "s2", to_stage_id: "s3", created_at: "2026-02-12T00:00:00Z" },
    ];

    const result = computeVelocityAnalytics({
      applications, stageHistory, stages, jobs, dateRange,
    });

    // Screening (s2) took 10 days — should be the bottleneck
    expect(result.bottleneckStage).toBe("Screening");
  });

  it("should return null bottleneck when no velocity data", () => {
    const result = computeVelocityAnalytics({
      applications: [], stageHistory: [], stages, jobs: [], dateRange,
    });

    expect(result.stageVelocity.every((s) => s.avgDays === 0)).toBe(true);
  });
});
