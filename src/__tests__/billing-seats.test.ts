import { describe, it, expect } from "vitest";
import {
  checkSeatLimit,
  calculateExtraSeats,
  seatUsagePercent,
} from "@/lib/billing/seats";

describe("checkSeatLimit", () => {
  it("should allow adding seat when under included limit", () => {
    const result = checkSeatLimit("growth", 5, false);
    expect(result.allowed).toBe(true);
    expect(result.requires_billing).toBe(false);
    expect(result.seats_included).toBe(10);
  });

  it("should allow adding seat at exactly included limit minus one", () => {
    // growth has 10 included, 9 current -> adding 1 makes 10 (at limit, still OK)
    const result = checkSeatLimit("growth", 9, false);
    expect(result.allowed).toBe(true);
    expect(result.requires_billing).toBe(false);
  });

  it("should block when at limit without stripe customer", () => {
    // growth has 10 included, 10 current -> adding 1 makes 11 (over limit)
    const result = checkSeatLimit("growth", 10, false);
    expect(result.allowed).toBe(false);
    expect(result.requires_billing).toBe(true);
    expect(result.error).toContain("Seat limit reached");
  });

  it("should allow extra seat when stripe customer exists", () => {
    const result = checkSeatLimit("growth", 10, true);
    expect(result.allowed).toBe(true);
    expect(result.requires_billing).toBe(true);
    expect(result.seats_extra).toBe(1);
  });

  it("should always allow for enterprise (unlimited)", () => {
    const result = checkSeatLimit("enterprise", 100, false);
    expect(result.allowed).toBe(true);
    expect(result.requires_billing).toBe(false);
    expect(result.seats_included).toBe(-1);
  });

  it("should handle starter plan (2 seats)", () => {
    // Under limit
    const under = checkSeatLimit("starter", 1, false);
    expect(under.allowed).toBe(true);

    // At limit
    const atLimit = checkSeatLimit("starter", 2, false);
    expect(atLimit.allowed).toBe(false);
    expect(atLimit.requires_billing).toBe(true);
  });

  it("should fall back to starter limits for unknown plan", () => {
    const result = checkSeatLimit("invalid", 2, false);
    expect(result.allowed).toBe(false); // starter has 2 seats
    expect(result.seats_included).toBe(2);
  });
});

describe("calculateExtraSeats", () => {
  it("should return 0 when under included seats", () => {
    expect(calculateExtraSeats("growth", 5)).toBe(0);
  });

  it("should return 0 when exactly at included seats", () => {
    expect(calculateExtraSeats("growth", 10)).toBe(0);
  });

  it("should return correct extra count when over", () => {
    expect(calculateExtraSeats("growth", 15)).toBe(5);
  });

  it("should return 0 for enterprise (unlimited)", () => {
    expect(calculateExtraSeats("enterprise", 100)).toBe(0);
  });

  it("should handle starter plan", () => {
    expect(calculateExtraSeats("starter", 3)).toBe(1);
    expect(calculateExtraSeats("starter", 2)).toBe(0);
  });
});

describe("seatUsagePercent", () => {
  it("should return correct percentage", () => {
    expect(seatUsagePercent("growth", 5)).toBe(50);
    expect(seatUsagePercent("growth", 10)).toBe(100);
  });

  it("should cap at 100%", () => {
    expect(seatUsagePercent("growth", 15)).toBe(100);
  });

  it("should return 0 for enterprise (unlimited)", () => {
    expect(seatUsagePercent("enterprise", 100)).toBe(0);
  });
});
