import { describe, it, expect } from "vitest";
import { computeTeamAnalytics, type RawJob, type RawApplication, type RawInterview, type RawScorecardSubmission, type RawUserProfile, type DateRange } from "@/lib/analytics/compute";

const dateRange: DateRange = {
  from: new Date("2026-01-01"),
  to: new Date("2026-03-31"),
};

const profiles: RawUserProfile[] = [
  { id: "r1", full_name: "Sarah Chen" },
  { id: "iv1", full_name: "Alex Kim" },
];

const jobs: RawJob[] = [
  { id: "j1", title: "Engineer", department: "Eng", status: "open", recruiter_id: "r1", published_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
];

const applications: RawApplication[] = [
  { id: "a1", job_opening_id: "j1", candidate_id: "c1", status: "active", current_stage_id: "s2", applied_at: "2026-02-01T00:00:00Z", hired_at: null, rejected_at: null, withdrawn_at: null },
  { id: "a2", job_opening_id: "j1", candidate_id: "c2", status: "active", current_stage_id: "s1", applied_at: "2026-02-05T00:00:00Z", hired_at: null, rejected_at: null, withdrawn_at: null },
];

describe("computeTeamAnalytics", () => {
  it("should compute recruiter pipeline count", () => {
    const result = computeTeamAnalytics({
      jobs, applications, interviews: [], scorecards: [], profiles, dateRange,
    });

    expect(result.recruiters).toHaveLength(1);
    expect(result.recruiters[0]?.name).toBe("Sarah Chen");
    expect(result.recruiters[0]?.openJobCount).toBe(1);
    expect(result.recruiters[0]?.activePipelineCount).toBe(2);
  });

  it("should compute interviewer feedback turnaround", () => {
    const interviews: RawInterview[] = [
      {
        id: "i1", application_id: "a1", job_opening_id: "j1", interviewer_id: "iv1",
        status: "completed", scheduled_at: "2026-02-10T09:00:00Z",
        completed_at: "2026-02-10T10:00:00Z", created_at: "2026-02-08T00:00:00Z",
      },
    ];
    const scorecards: RawScorecardSubmission[] = [
      {
        id: "sc1", interview_id: "i1", application_id: "a1", submitted_by: "iv1",
        created_at: "2026-02-10T14:00:00Z", // 4 hours after completion
      },
    ];

    const result = computeTeamAnalytics({
      jobs, applications, interviews, scorecards, profiles, dateRange,
    });

    const interviewer = result.interviewers.find((i) => i.userId === "iv1");
    expect(interviewer?.completedCount).toBe(1);
    expect(interviewer?.avgFeedbackTurnaroundHours).toBe(4);
  });

  it("should detect overdue interviews", () => {
    const interviews: RawInterview[] = [
      {
        id: "i1", application_id: "a1", job_opening_id: "j1", interviewer_id: "iv1",
        status: "scheduled", scheduled_at: "2026-01-01T09:00:00Z", // in the past
        completed_at: null, created_at: "2026-01-02T00:00:00Z",
      },
    ];

    const result = computeTeamAnalytics({
      jobs, applications, interviews, scorecards: [], profiles, dateRange,
    });

    const interviewer = result.interviewers.find((i) => i.userId === "iv1");
    expect(interviewer?.overdueCount).toBe(1);
  });

  it("should compute feedback compliance rate", () => {
    const interviews: RawInterview[] = [
      { id: "i1", application_id: "a1", job_opening_id: "j1", interviewer_id: "iv1", status: "completed", scheduled_at: null, completed_at: "2026-02-10T10:00:00Z", created_at: "2026-02-01T00:00:00Z" },
      { id: "i2", application_id: "a2", job_opening_id: "j1", interviewer_id: "iv1", status: "completed", scheduled_at: null, completed_at: "2026-02-11T10:00:00Z", created_at: "2026-02-01T00:00:00Z" },
    ];
    const scorecards: RawScorecardSubmission[] = [
      { id: "sc1", interview_id: "i1", application_id: "a1", submitted_by: "iv1", created_at: "2026-02-10T12:00:00Z" },
      // No scorecard for i2
    ];

    const result = computeTeamAnalytics({
      jobs, applications, interviews, scorecards, profiles, dateRange,
    });

    // Recruiter feedback compliance: 1 of 2 completed interviews has feedback = 0.5
    expect(result.recruiters[0]?.feedbackComplianceRate).toBe(0.5);
  });
});
