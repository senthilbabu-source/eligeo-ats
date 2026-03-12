import { describe, it, expect } from "vitest";
import { computeNextBestAction } from "@/app/(app)/candidates/[id]/next-best-action";

const NOW = new Date("2026-03-11T12:00:00Z").getTime();

function daysAgo(days: number): Date {
  return new Date(NOW - days * 24 * 60 * 60 * 1000);
}

describe("computeNextBestAction", () => {
  it("should return no_applications action when activeApps is empty", () => {
    const result = computeNextBestAction({ activeApps: [], nowMs: NOW });
    expect(result?.type).toBe("no_applications");
    expect(result?.message).toContain("No active applications");
  });

  it("should return stalled action when app exceeds threshold", () => {
    const result = computeNextBestAction({
      activeApps: [{ id: "app-1", stageEnteredAt: daysAgo(20), stageName: "Screening", jobTitle: "Engineer" }],
      nowMs: NOW,
      stallThresholdDays: 14,
    });
    expect(result?.type).toBe("stalled");
    expect(result?.message).toContain("20 days");
    expect(result?.message).toContain("Screening");
    expect(result?.message).toContain("Engineer");
  });

  it("should return null when no app exceeds threshold", () => {
    const result = computeNextBestAction({
      activeApps: [{ id: "app-1", stageEnteredAt: daysAgo(5), stageName: "Applied", jobTitle: "Engineer" }],
      nowMs: NOW,
      stallThresholdDays: 14,
    });
    expect(result).toBeNull();
  });

  it("should pick the most stalled app when multiple active applications exist", () => {
    const result = computeNextBestAction({
      activeApps: [
        { id: "app-1", stageEnteredAt: daysAgo(8), stageName: "Screening", jobTitle: "Engineer" },
        { id: "app-2", stageEnteredAt: daysAgo(25), stageName: "Interview", jobTitle: "Staff Engineer" },
      ],
      nowMs: NOW,
      stallThresholdDays: 14,
    });
    expect(result?.type).toBe("stalled");
    expect(result?.message).toContain("25 days");
    expect(result?.message).toContain("Interview");
  });

  it("should handle app with null stageEnteredAt gracefully", () => {
    const result = computeNextBestAction({
      activeApps: [{ id: "app-1", stageEnteredAt: null, stageName: "Screening", jobTitle: "Engineer" }],
      nowMs: NOW,
      stallThresholdDays: 14,
    });
    // No entry time -> can't determine stall -> no action
    expect(result).toBeNull();
  });

  // ── H3-4: New rule tests ────────────────────────────────

  it("should return high_match_no_interview when match score > 0.75 and no interview", () => {
    const result = computeNextBestAction({
      activeApps: [{
        id: "app-1",
        stageEnteredAt: daysAgo(3),
        stageName: "Applied",
        jobTitle: "Engineer",
        matchScore: 0.82,
        hasInterview: false,
      }],
      nowMs: NOW,
    });
    expect(result?.type).toBe("high_match_no_interview");
    expect(result?.message).toContain("82%");
    expect(result?.message).toContain("schedule an interview");
  });

  it("should return scorecard_complete when all scorecards are in", () => {
    const result = computeNextBestAction({
      activeApps: [{
        id: "app-1",
        stageEnteredAt: daysAgo(5),
        stageName: "Interview",
        jobTitle: "Engineer",
        allScorecardsIn: true,
        hasApprovedOffer: false,
      }],
      nowMs: NOW,
    });
    expect(result?.type).toBe("scorecard_complete");
    expect(result?.message).toContain("feedback received");
  });

  it("should return offer_ready when approved offer exists but not sent", () => {
    const result = computeNextBestAction({
      activeApps: [{
        id: "app-1",
        stageEnteredAt: daysAgo(2),
        stageName: "Offer",
        jobTitle: "Engineer",
        hasApprovedOffer: true,
        offerSent: false,
      }],
      nowMs: NOW,
    });
    expect(result?.type).toBe("offer_ready");
    expect(result?.message).toContain("send to candidate");
  });

  it("should return at_risk when days > 7 and match score < 0.5", () => {
    const result = computeNextBestAction({
      activeApps: [{
        id: "app-1",
        stageEnteredAt: daysAgo(10),
        stageName: "Screening",
        jobTitle: "Engineer",
        matchScore: 0.35,
      }],
      nowMs: NOW,
    });
    expect(result?.type).toBe("at_risk");
    expect(result?.message).toContain("35%");
    expect(result?.message).toContain("rejection or talent pool");
  });

  it("should prioritize offer_ready over stalled when both match", () => {
    const result = computeNextBestAction({
      activeApps: [{
        id: "app-1",
        stageEnteredAt: daysAgo(20),
        stageName: "Offer",
        jobTitle: "Engineer",
        hasApprovedOffer: true,
        offerSent: false,
      }],
      nowMs: NOW,
    });
    // offer_ready (priority 1) should beat stalled (priority 4)
    expect(result?.type).toBe("offer_ready");
  });

  it("should not trigger at_risk when days <= 7 even with low match", () => {
    const result = computeNextBestAction({
      activeApps: [{
        id: "app-1",
        stageEnteredAt: daysAgo(5),
        stageName: "Applied",
        jobTitle: "Engineer",
        matchScore: 0.3,
      }],
      nowMs: NOW,
    });
    expect(result).toBeNull();
  });

  it("should not trigger high_match_no_interview when interview exists", () => {
    const result = computeNextBestAction({
      activeApps: [{
        id: "app-1",
        stageEnteredAt: daysAgo(3),
        stageName: "Applied",
        jobTitle: "Engineer",
        matchScore: 0.9,
        hasInterview: true,
      }],
      nowMs: NOW,
    });
    expect(result).toBeNull();
  });
});
