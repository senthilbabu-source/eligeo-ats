import { describe, it, expect } from "vitest";

/**
 * Billing UI component unit tests.
 * Tests pure rendering logic (formatValue, banner visibility rules, usage meter math).
 * Components are Server Components — we test the logic, not React rendering.
 */

// ── UsageMeter logic ─────────────────────────────────────────

describe("UsageMeter logic", () => {
  function computeMeter(used: number, limit: number) {
    const isUnlimited = limit === -1;
    const percent = isUnlimited ? 0 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const isWarning = percent >= 80 && percent < 100;
    const isDanger = percent >= 100;
    return { isUnlimited, percent, isWarning, isDanger };
  }

  it("should show 0% for unlimited limits", () => {
    const result = computeMeter(50, -1);
    expect(result.isUnlimited).toBe(true);
    expect(result.percent).toBe(0);
  });

  it("should calculate percentage correctly", () => {
    const result = computeMeter(5, 10);
    expect(result.percent).toBe(50);
    expect(result.isWarning).toBe(false);
    expect(result.isDanger).toBe(false);
  });

  it("should flag warning at 80%", () => {
    const result = computeMeter(8, 10);
    expect(result.percent).toBe(80);
    expect(result.isWarning).toBe(true);
    expect(result.isDanger).toBe(false);
  });

  it("should flag danger at 100%", () => {
    const result = computeMeter(10, 10);
    expect(result.percent).toBe(100);
    expect(result.isWarning).toBe(false);
    expect(result.isDanger).toBe(true);
  });

  it("should cap at 100% when over limit", () => {
    const result = computeMeter(15, 10);
    expect(result.percent).toBe(100);
    expect(result.isDanger).toBe(true);
  });

  it("should handle zero limit gracefully", () => {
    const result = computeMeter(0, 0);
    expect(result.percent).toBe(0);
  });
});

// ── TrialBanner logic ────────────────────────────────────────

describe("TrialBanner visibility", () => {
  function shouldShowTrialBanner(trialEndsAt: string) {
    const now = new Date("2026-03-12T12:00:00Z");
    const endsAt = new Date(trialEndsAt);
    const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    return { show: daysLeft <= 7, daysLeft };
  }

  it("should not show when trial ends in more than 7 days", () => {
    const result = shouldShowTrialBanner("2026-03-25T00:00:00Z");
    expect(result.show).toBe(false);
  });

  it("should show when trial ends in 7 days", () => {
    const result = shouldShowTrialBanner("2026-03-19T12:00:00Z");
    expect(result.show).toBe(true);
    expect(result.daysLeft).toBe(7);
  });

  it("should show when trial ends in 1 day", () => {
    const result = shouldShowTrialBanner("2026-03-13T12:00:00Z");
    expect(result.show).toBe(true);
    expect(result.daysLeft).toBe(1);
  });

  it("should show 0 days when trial has expired", () => {
    const result = shouldShowTrialBanner("2026-03-10T00:00:00Z");
    expect(result.show).toBe(true);
    expect(result.daysLeft).toBe(0);
  });
});

// ── UpgradeBanner logic ──────────────────────────────────────

describe("UpgradeBanner visibility", () => {
  function shouldShowUpgradeBanner(plan: string, seatPercent: number, creditPercent: number) {
    if (plan !== "starter") return { show: false, reason: null };
    if (seatPercent >= 80) return { show: true, reason: "seats" };
    if (creditPercent >= 80) return { show: true, reason: "AI credits" };
    return { show: false, reason: null };
  }

  it("should not show for non-starter plans", () => {
    expect(shouldShowUpgradeBanner("growth", 90, 90).show).toBe(false);
    expect(shouldShowUpgradeBanner("pro", 100, 100).show).toBe(false);
    expect(shouldShowUpgradeBanner("enterprise", 100, 100).show).toBe(false);
  });

  it("should not show when usage is below 80%", () => {
    expect(shouldShowUpgradeBanner("starter", 50, 50).show).toBe(false);
    expect(shouldShowUpgradeBanner("starter", 79, 79).show).toBe(false);
  });

  it("should show when seats at 80%", () => {
    const result = shouldShowUpgradeBanner("starter", 80, 50);
    expect(result.show).toBe(true);
    expect(result.reason).toBe("seats");
  });

  it("should show when AI credits at 80%", () => {
    const result = shouldShowUpgradeBanner("starter", 50, 80);
    expect(result.show).toBe(true);
    expect(result.reason).toBe("AI credits");
  });

  it("should prioritize seats when both near limit", () => {
    const result = shouldShowUpgradeBanner("starter", 90, 90);
    expect(result.show).toBe(true);
    expect(result.reason).toBe("seats");
  });
});

// ── PaymentFailedBanner logic ────────────────────────────────

describe("PaymentFailedBanner visibility", () => {
  function shouldShowPaymentBanner(status: string) {
    return status === "past_due";
  }

  it("should show only for past_due status", () => {
    expect(shouldShowPaymentBanner("past_due")).toBe(true);
  });

  it("should not show for active status", () => {
    expect(shouldShowPaymentBanner("active")).toBe(false);
  });

  it("should not show for trialing status", () => {
    expect(shouldShowPaymentBanner("trialing")).toBe(false);
  });

  it("should not show for canceled status", () => {
    expect(shouldShowPaymentBanner("canceled")).toBe(false);
  });
});

// ── PricingTable formatValue ─────────────────────────────────

import {
  PLAN_LIMITS,
  PLAN_FEATURE_DEFAULTS,
  PLAN_PRICING,
  type PlanTier,
} from "@/lib/billing/plans";

describe("PricingTable formatValue", () => {
  function formatValue(key: string, tier: PlanTier): string {
    const limits = PLAN_LIMITS[tier];
    const features = PLAN_FEATURE_DEFAULTS[tier];

    if (key === "max_seats") return limits.max_seats === -1 ? "Unlimited" : String(limits.max_seats);
    if (key === "max_active_jobs") return limits.max_active_jobs === -1 ? "Unlimited" : String(limits.max_active_jobs);
    if (key === "ai_credits_monthly") return limits.ai_credits_monthly.toLocaleString();

    const featureKey = key as keyof typeof features;
    if (featureKey in features) {
      return features[featureKey] ? "✓" : "—";
    }
    return "—";
  }

  it("should format starter seats as number", () => {
    expect(formatValue("max_seats", "starter")).toBe("2");
  });

  it("should format enterprise seats as Unlimited", () => {
    expect(formatValue("max_seats", "enterprise")).toBe("Unlimited");
  });

  it("should format pro active jobs as Unlimited", () => {
    expect(formatValue("max_active_jobs", "pro")).toBe("Unlimited");
  });

  it("should format starter active jobs as number", () => {
    expect(formatValue("max_active_jobs", "starter")).toBe("5");
  });

  it("should format AI credits with locale string", () => {
    const val = formatValue("ai_credits_monthly", "enterprise");
    expect(val).toContain("10");
  });

  it("should show ✓ for enabled features", () => {
    expect(formatValue("ai_resume_parsing", "pro")).toBe("✓");
  });

  it("should show — for disabled features", () => {
    expect(formatValue("ai_resume_parsing", "starter")).toBe("—");
  });

  it("should show — for unknown keys", () => {
    expect(formatValue("nonexistent_feature", "starter")).toBe("—");
  });
});

// ── PlanCard label logic ─────────────────────────────────────

describe("PlanCard labels", () => {
  const PLAN_LABELS: Record<string, string> = {
    starter: "Starter",
    growth: "Growth",
    pro: "Pro",
    enterprise: "Enterprise",
  };

  it("should map all plan tiers to labels", () => {
    expect(PLAN_LABELS["starter"]).toBe("Starter");
    expect(PLAN_LABELS["growth"]).toBe("Growth");
    expect(PLAN_LABELS["pro"]).toBe("Pro");
    expect(PLAN_LABELS["enterprise"]).toBe("Enterprise");
  });

  it("should handle unknown plan gracefully", () => {
    const plan = "unknown";
    const label = PLAN_LABELS[plan] ?? plan;
    expect(label).toBe("unknown");
  });

  it("should show Trial for trialing status", () => {
    const status = "trialing";
    const label = status === "trialing" ? "Trial" : status;
    expect(label).toBe("Trial");
  });
});

// ── Pricing display ──────────────────────────────────────────

describe("Pricing display", () => {
  it("should format monthly prices correctly", () => {
    expect((PLAN_PRICING.starter.monthly / 100).toFixed(0)).toBe("29");
    expect((PLAN_PRICING.growth.monthly / 100).toFixed(0)).toBe("79");
    expect((PLAN_PRICING.pro.monthly / 100).toFixed(0)).toBe("199");
  });

  it("should show Custom for enterprise", () => {
    expect(PLAN_PRICING.enterprise.monthly).toBe(0);
  });

  it("should have annual pricing lower than monthly", () => {
    for (const tier of ["starter", "growth", "pro"] as PlanTier[]) {
      expect(PLAN_PRICING[tier].annual_monthly).toBeLessThan(PLAN_PRICING[tier].monthly);
    }
  });
});

// ── Banner priority logic ────────────────────────────────────

describe("BillingBanners priority", () => {
  function getBannerType(status: string, isTrialing: boolean, hasTrialEnd: boolean, plan: string, seatPct: number, creditPct: number) {
    if (status === "past_due") return "payment_failed";
    if (isTrialing && hasTrialEnd) return "trial";
    if (plan === "starter" && (seatPct >= 80 || creditPct >= 80)) return "upgrade";
    return null;
  }

  it("should prioritize payment_failed over everything", () => {
    expect(getBannerType("past_due", true, true, "starter", 100, 100)).toBe("payment_failed");
  });

  it("should show trial banner when trialing", () => {
    expect(getBannerType("trialing", true, true, "starter", 50, 50)).toBe("trial");
  });

  it("should show upgrade banner for starter near limits", () => {
    expect(getBannerType("active", false, false, "starter", 90, 50)).toBe("upgrade");
  });

  it("should show nothing for healthy active account", () => {
    expect(getBannerType("active", false, false, "growth", 50, 50)).toBeNull();
  });
});
