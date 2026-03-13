import { describe, it, expect } from "vitest";
import { computeJobHealthScore, predictTimeToFill } from "@/lib/analytics/compute";

describe("computeJobHealthScore", () => {
  it("should return 0 for worst-case parameters", () => {
    const score = computeJobHealthScore({
      daysOpen: 180,
      applicationCount: 0,
      activeCount: 0,
      stageVelocityDays: 70,
      industryBenchmarkDays: 35,
    });

    expect(score).toBe(0);
  });

  it("should return close to 1 for best-case parameters", () => {
    const score = computeJobHealthScore({
      daysOpen: 5,
      applicationCount: 25,
      activeCount: 15,
      stageVelocityDays: 3,
      industryBenchmarkDays: 35,
    });

    expect(score).toBeGreaterThanOrEqual(0.8);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("should return 0.5 range for moderate parameters", () => {
    const score = computeJobHealthScore({
      daysOpen: 30,
      applicationCount: 10,
      activeCount: 5,
      stageVelocityDays: 15,
      industryBenchmarkDays: 35,
    });

    expect(score).toBeGreaterThanOrEqual(0.3);
    expect(score).toBeLessThanOrEqual(0.7);
  });

  it("should use default industry benchmark when not provided", () => {
    const score = computeJobHealthScore({
      daysOpen: 20,
      applicationCount: 10,
      activeCount: 5,
      stageVelocityDays: 10,
    });

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("predictTimeToFill", () => {
  it("should return null when no active candidates", () => {
    const result = predictTimeToFill({
      currentActiveCount: 0,
      avgStageVelocityDays: 5,
      stagesRemaining: 3,
      historicalFillRate: 0.1,
    });

    expect(result).toBeNull();
  });

  it("should return null when fill rate is zero", () => {
    const result = predictTimeToFill({
      currentActiveCount: 5,
      avgStageVelocityDays: 5,
      stagesRemaining: 3,
      historicalFillRate: 0,
    });

    expect(result).toBeNull();
  });

  it("should compute a positive prediction", () => {
    const result = predictTimeToFill({
      currentActiveCount: 10,
      avgStageVelocityDays: 5,
      stagesRemaining: 3,
      historicalFillRate: 0.5,
    });

    expect(result).toBeGreaterThanOrEqual(1);
    // 3 * 5 / 0.5 = 30
    expect(result).toBe(30);
  });

  it("should return minimum of 1 day", () => {
    const result = predictTimeToFill({
      currentActiveCount: 100,
      avgStageVelocityDays: 0.1,
      stagesRemaining: 1,
      historicalFillRate: 1,
    });

    expect(result).toBeGreaterThanOrEqual(1);
  });
});
