import { describe, it, expect } from "vitest";
import {
  calculateOverage,
  hasAvailableCredits,
  creditUsagePercent,
} from "@/lib/billing/credits";
import { AI_OVERAGE_PRICE_CENTS, AI_OVERAGE_UNIT } from "@/lib/billing/plans";

describe("calculateOverage", () => {
  it("should return zero overage when under limit", () => {
    const result = calculateOverage(50, 500);
    expect(result.overage_credits).toBe(0);
    expect(result.overage_units).toBe(0);
    expect(result.overage_cost_cents).toBe(0);
  });

  it("should return zero overage when exactly at limit", () => {
    const result = calculateOverage(500, 500);
    expect(result.overage_credits).toBe(0);
    expect(result.overage_units).toBe(0);
    expect(result.overage_cost_cents).toBe(0);
  });

  it("should calculate overage correctly when over limit", () => {
    const result = calculateOverage(650, 500);
    expect(result.overage_credits).toBe(150);
    expect(result.overage_units).toBe(2); // ceil(150/100) = 2
    expect(result.overage_cost_cents).toBe(2 * AI_OVERAGE_PRICE_CENTS);
  });

  it("should round up overage units to nearest 100", () => {
    // 1 credit over = still 1 unit
    const result = calculateOverage(501, 500);
    expect(result.overage_credits).toBe(1);
    expect(result.overage_units).toBe(1);
    expect(result.overage_cost_cents).toBe(AI_OVERAGE_PRICE_CENTS);
  });

  it("should handle exact unit boundaries", () => {
    const result = calculateOverage(700, 500);
    expect(result.overage_credits).toBe(200);
    expect(result.overage_units).toBe(2); // exactly 2 units
    expect(result.overage_cost_cents).toBe(2 * AI_OVERAGE_PRICE_CENTS);
  });

  it("should handle zero limit", () => {
    const result = calculateOverage(10, 0);
    expect(result.overage_credits).toBe(10);
    expect(result.overage_units).toBe(1);
  });
});

describe("hasAvailableCredits", () => {
  it("should return true when credits remain", () => {
    expect(hasAvailableCredits(5, 10)).toBe(true);
  });

  it("should return false when at limit", () => {
    expect(hasAvailableCredits(10, 10)).toBe(false);
  });

  it("should return false when over limit", () => {
    expect(hasAvailableCredits(15, 10)).toBe(false);
  });

  it("should return false when limit is zero and used is zero", () => {
    expect(hasAvailableCredits(0, 0)).toBe(false);
  });
});

describe("creditUsagePercent", () => {
  it("should return correct percentage", () => {
    expect(creditUsagePercent(50, 100)).toBe(50);
    expect(creditUsagePercent(75, 100)).toBe(75);
  });

  it("should cap at 100%", () => {
    expect(creditUsagePercent(150, 100)).toBe(100);
  });

  it("should return 0 for zero limit with zero used", () => {
    expect(creditUsagePercent(0, 0)).toBe(0);
  });

  it("should return 100 for zero limit with nonzero used", () => {
    expect(creditUsagePercent(5, 0)).toBe(100);
  });

  it("should round to nearest integer", () => {
    expect(creditUsagePercent(1, 3)).toBe(33);
    expect(creditUsagePercent(2, 3)).toBe(67);
  });
});
