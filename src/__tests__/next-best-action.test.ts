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
    // No entry time → can't determine stall → no action
    expect(result).toBeNull();
  });
});
