/**
 * Plan configuration and feature gating for Eligeo billing.
 *
 * PLAN_LIMITS and PLAN_FEATURE_DEFAULTS live here — not in the database.
 * Plan definitions change with deploys, not with migrations (D03 §2.1).
 *
 * Feature gating: explicit org override > plan default.
 */

import type { FeatureFlags } from "@/lib/types/ground-truth";

// ── Plan Types ───────────────────────────────────────────────

export const PLAN_TIERS = ["starter", "growth", "pro", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export interface PlanLimits {
  max_seats: number; // -1 = unlimited
  max_active_jobs: number; // -1 = unlimited
  ai_credits_monthly: number;
  extra_seat_price_cents: number;
  ai_operations_daily: number; // rate limit (burst cap)
}

// ── Plan Limits (D03 §2) ────────────────────────────────────

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  starter: {
    max_seats: 2,
    max_active_jobs: 5,
    ai_credits_monthly: 10,
    extra_seat_price_cents: 1500,
    ai_operations_daily: 100,
  },
  growth: {
    max_seats: 10,
    max_active_jobs: 25,
    ai_credits_monthly: 500,
    extra_seat_price_cents: 1200,
    ai_operations_daily: 500,
  },
  pro: {
    max_seats: 25,
    max_active_jobs: -1,
    ai_credits_monthly: 2000,
    extra_seat_price_cents: 1000,
    ai_operations_daily: 2000,
  },
  enterprise: {
    max_seats: -1,
    max_active_jobs: -1,
    ai_credits_monthly: 10000,
    extra_seat_price_cents: 0,
    ai_operations_daily: 10000,
  },
};

// ── Feature Defaults per Plan (D03 §2) ──────────────────────

export const PLAN_FEATURE_DEFAULTS: Record<PlanTier, FeatureFlags> = {
  starter: {
    ai_matching: false,
    ai_resume_parsing: false,
    ai_scorecard_summarize: false,
    bulk_import: false,
    api_access: false,
    custom_fields: false,
    white_label: false,
    advanced_analytics: false,
    nurture_sequences: false,
    webhook_outbound: false,
    sso_saml: false,
  },
  growth: {
    ai_matching: false,
    ai_resume_parsing: true,
    ai_scorecard_summarize: false,
    bulk_import: true,
    api_access: false,
    custom_fields: true,
    white_label: false,
    advanced_analytics: false,
    nurture_sequences: false,
    webhook_outbound: true,
    sso_saml: false,
  },
  pro: {
    ai_matching: true,
    ai_resume_parsing: true,
    ai_scorecard_summarize: true,
    bulk_import: true,
    api_access: true,
    custom_fields: true,
    white_label: false,
    advanced_analytics: true,
    nurture_sequences: true,
    webhook_outbound: true,
    sso_saml: false,
  },
  enterprise: {
    ai_matching: true,
    ai_resume_parsing: true,
    ai_scorecard_summarize: true,
    bulk_import: true,
    api_access: true,
    custom_fields: true,
    white_label: true,
    advanced_analytics: true,
    nurture_sequences: true,
    webhook_outbound: true,
    sso_saml: true,
  },
};

// ── Pricing (D03 §3.1) ─────────────────────────────────────

export const PLAN_PRICING: Record<PlanTier, { monthly: number; annual_monthly: number }> = {
  starter: { monthly: 2900, annual_monthly: 2400 },
  growth: { monthly: 7900, annual_monthly: 6600 },
  pro: { monthly: 19900, annual_monthly: 16600 },
  enterprise: { monthly: 0, annual_monthly: 0 }, // custom pricing
};

/** AI credit overage price: $5 per 100 credits */
export const AI_OVERAGE_PRICE_CENTS = 500;
export const AI_OVERAGE_UNIT = 100;

// ── Feature Gating ──────────────────────────────────────────

/**
 * Check if an organization has a specific feature enabled.
 * Explicit override in feature_flags takes precedence over plan defaults.
 */
export function hasFeature(
  plan: string,
  featureFlags: Partial<FeatureFlags>,
  feature: keyof FeatureFlags,
): boolean {
  // Explicit override takes precedence
  const override = featureFlags[feature];
  if (override !== undefined) {
    return override;
  }
  // Fall back to plan defaults
  const tier = isValidPlan(plan) ? plan : "starter";
  return PLAN_FEATURE_DEFAULTS[tier][feature] ?? false;
}

/**
 * Assert a feature is enabled, or throw.
 * Use in Server Actions for early rejection.
 */
export function requireFeature(
  plan: string,
  featureFlags: Partial<FeatureFlags>,
  feature: keyof FeatureFlags,
): void {
  if (!hasFeature(plan, featureFlags, feature)) {
    throw new Error(
      `Feature "${feature}" requires a plan upgrade. Current plan: ${plan}`,
    );
  }
}

/**
 * Get plan limits for a given plan tier.
 * Returns starter limits for unknown plan values.
 */
export function getPlanLimits(plan: string): PlanLimits {
  const tier = isValidPlan(plan) ? plan : "starter";
  return PLAN_LIMITS[tier];
}

/**
 * Get all resolved feature flags for an org (plan defaults merged with overrides).
 */
export function resolveFeatureFlags(
  plan: string,
  featureFlags: Partial<FeatureFlags>,
): FeatureFlags {
  const tier = isValidPlan(plan) ? plan : "starter";
  const defaults = PLAN_FEATURE_DEFAULTS[tier];
  return { ...defaults, ...featureFlags };
}

/**
 * Type guard for valid plan tiers.
 */
export function isValidPlan(plan: string): plan is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(plan);
}

// ── API Rate Limits (D03 §2 / D02 §6) ──────────────────────

export const API_RATE_LIMITS: Record<PlanTier, number> = {
  starter: 500,
  growth: 2000,
  pro: 5000,
  enterprise: 10000,
};
