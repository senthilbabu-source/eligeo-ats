import { describe, it, expect } from "vitest";
import {
  PLAN_TIERS,
  PLAN_LIMITS,
  PLAN_FEATURE_DEFAULTS,
  PLAN_PRICING,
  API_RATE_LIMITS,
  hasFeature,
  requireFeature,
  getPlanLimits,
  resolveFeatureFlags,
  isValidPlan,
} from "@/lib/billing/plans";

describe("Plan Configuration", () => {
  it("should define exactly 4 plan tiers", () => {
    expect(PLAN_TIERS).toEqual(["starter", "growth", "pro", "enterprise"]);
  });

  it("should have limits for every plan tier", () => {
    for (const tier of PLAN_TIERS) {
      const limits = PLAN_LIMITS[tier];
      expect(limits).toBeDefined();
      expect(limits.max_seats).toBeDefined();
      expect(limits.max_active_jobs).toBeDefined();
      expect(limits.ai_credits_monthly).toBeDefined();
      expect(limits.extra_seat_price_cents).toBeDefined();
      expect(limits.ai_operations_daily).toBeDefined();
    }
  });

  it("should have increasing AI credits across tiers", () => {
    expect(PLAN_LIMITS.starter.ai_credits_monthly).toBe(10);
    expect(PLAN_LIMITS.growth.ai_credits_monthly).toBe(500);
    expect(PLAN_LIMITS.pro.ai_credits_monthly).toBe(2000);
    expect(PLAN_LIMITS.enterprise.ai_credits_monthly).toBe(10000);
  });

  it("should have unlimited seats and jobs for enterprise", () => {
    expect(PLAN_LIMITS.enterprise.max_seats).toBe(-1);
    expect(PLAN_LIMITS.enterprise.max_active_jobs).toBe(-1);
  });

  it("should have unlimited jobs for pro", () => {
    expect(PLAN_LIMITS.pro.max_active_jobs).toBe(-1);
  });

  it("should have pricing for every tier", () => {
    for (const tier of PLAN_TIERS) {
      expect(PLAN_PRICING[tier]).toBeDefined();
    }
  });

  it("should have rate limits for every tier", () => {
    for (const tier of PLAN_TIERS) {
      expect(API_RATE_LIMITS[tier]).toBeGreaterThan(0);
    }
  });
});

describe("isValidPlan", () => {
  it("should return true for valid plan names", () => {
    expect(isValidPlan("starter")).toBe(true);
    expect(isValidPlan("growth")).toBe(true);
    expect(isValidPlan("pro")).toBe(true);
    expect(isValidPlan("enterprise")).toBe(true);
  });

  it("should return false for invalid plan names", () => {
    expect(isValidPlan("free")).toBe(false);
    expect(isValidPlan("premium")).toBe(false);
    expect(isValidPlan("")).toBe(false);
  });
});

describe("getPlanLimits", () => {
  it("should return correct limits for valid plan", () => {
    const limits = getPlanLimits("pro");
    expect(limits.max_seats).toBe(25);
    expect(limits.max_active_jobs).toBe(-1);
    expect(limits.ai_credits_monthly).toBe(2000);
  });

  it("should return starter limits for unknown plan", () => {
    const limits = getPlanLimits("nonexistent");
    expect(limits).toEqual(PLAN_LIMITS.starter);
  });
});

describe("hasFeature", () => {
  it("should return plan default when no override exists", () => {
    expect(hasFeature("starter", {}, "ai_matching")).toBe(false);
    expect(hasFeature("pro", {}, "ai_matching")).toBe(true);
    expect(hasFeature("enterprise", {}, "white_label")).toBe(true);
    expect(hasFeature("growth", {}, "white_label")).toBe(false);
  });

  it("should respect explicit override over plan default", () => {
    // Override enables a feature not in plan default
    expect(hasFeature("starter", { ai_matching: true }, "ai_matching")).toBe(true);
    // Override disables a feature that plan default enables
    expect(hasFeature("pro", { ai_matching: false }, "ai_matching")).toBe(false);
  });

  it("should handle false override explicitly", () => {
    // false override should be respected, not treated as undefined
    expect(hasFeature("enterprise", { sso_saml: false }, "sso_saml")).toBe(false);
  });

  it("should fall back to starter for unknown plan", () => {
    expect(hasFeature("invalid_plan", {}, "ai_matching")).toBe(false);
    expect(hasFeature("invalid_plan", {}, "bulk_import")).toBe(false);
  });

  it("should check growth tier features correctly", () => {
    // Growth has resume parsing but not matching
    expect(hasFeature("growth", {}, "ai_resume_parsing")).toBe(true);
    expect(hasFeature("growth", {}, "ai_matching")).toBe(false);
    expect(hasFeature("growth", {}, "bulk_import")).toBe(true);
    expect(hasFeature("growth", {}, "webhook_outbound")).toBe(true);
    expect(hasFeature("growth", {}, "api_access")).toBe(false);
  });
});

describe("requireFeature", () => {
  it("should not throw when feature is available", () => {
    expect(() => requireFeature("pro", {}, "ai_matching")).not.toThrow();
  });

  it("should throw when feature is not available", () => {
    expect(() => requireFeature("starter", {}, "ai_matching")).toThrow(
      /Feature "ai_matching" requires a plan upgrade/,
    );
  });

  it("should include plan name in error message", () => {
    expect(() => requireFeature("starter", {}, "bulk_import")).toThrow(
      /Current plan: starter/,
    );
  });

  it("should respect override even when throwing", () => {
    // Override disables, so it should throw
    expect(() => requireFeature("pro", { api_access: false }, "api_access")).toThrow();
    // Override enables, so it should not throw
    expect(() => requireFeature("starter", { api_access: true }, "api_access")).not.toThrow();
  });
});

describe("resolveFeatureFlags", () => {
  it("should return all plan defaults when no overrides", () => {
    const flags = resolveFeatureFlags("starter", {});
    expect(flags.ai_matching).toBe(false);
    expect(flags.ai_resume_parsing).toBe(false);
    expect(flags.sso_saml).toBe(false);
  });

  it("should merge overrides on top of defaults", () => {
    const flags = resolveFeatureFlags("starter", { ai_matching: true, bulk_import: true });
    expect(flags.ai_matching).toBe(true);
    expect(flags.bulk_import).toBe(true);
    // Rest should still be starter defaults
    expect(flags.white_label).toBe(false);
  });

  it("should return all true for enterprise with no overrides", () => {
    const flags = resolveFeatureFlags("enterprise", {});
    expect(flags.ai_matching).toBe(true);
    expect(flags.white_label).toBe(true);
    expect(flags.sso_saml).toBe(true);
  });

  it("should fall back to starter for unknown plan", () => {
    const flags = resolveFeatureFlags("bogus", {});
    expect(flags).toEqual(PLAN_FEATURE_DEFAULTS.starter);
  });
});
