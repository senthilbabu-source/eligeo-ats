/**
 * Billing enforcement helpers for Server Actions.
 *
 * These are thin wrappers around the billing utilities that return
 * `{ allowed: true }` or `{ allowed: false, error: string }` for
 * Server Actions to return directly. No throws — Server Actions
 * return error objects, not exceptions.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { getPlanLimits, hasFeature } from "./plans";
import { checkSeatLimit } from "./seats";
import type { FeatureFlags } from "@/lib/types/ground-truth";

type EnforcementResult =
  | { allowed: true }
  | { allowed: false; error: string; upgradeRequired: boolean };

/**
 * Check if an org can add a new member (seat limit enforcement).
 * D03 §2.2: Called in `inviteMember` Server Action.
 */
export async function enforceSeatLimit(
  orgId: string,
  plan: string,
): Promise<EnforcementResult> {
  const supabase = createServiceClient();

  // Count current active members
  const { count } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  // Check if org has a Stripe customer
  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", orgId)
    .is("deleted_at", null)
    .single();

  const result = checkSeatLimit(
    plan,
    count ?? 0,
    !!org?.stripe_customer_id,
  );

  if (!result.allowed) {
    return {
      allowed: false,
      error: result.error ?? "Seat limit reached. Upgrade your plan to add more members.",
      upgradeRequired: true,
    };
  }

  return { allowed: true };
}

/**
 * Check if an org can create a new active job (job limit enforcement).
 * D03 §2.2: Called in `createJob` Server Action.
 */
export async function enforceJobLimit(
  orgId: string,
  plan: string,
): Promise<EnforcementResult> {
  const limits = getPlanLimits(plan);

  // Unlimited jobs
  if (limits.max_active_jobs === -1) {
    return { allowed: true };
  }

  const supabase = createServiceClient();

  const { count } = await supabase
    .from("job_openings")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "open")
    .is("deleted_at", null);

  const activeCount = count ?? 0;

  if (activeCount >= limits.max_active_jobs) {
    return {
      allowed: false,
      error: `Active job limit reached (${limits.max_active_jobs} on ${plan} plan). Upgrade for more.`,
      upgradeRequired: true,
    };
  }

  return { allowed: true };
}

/**
 * Check if a feature is enabled for the org's plan.
 * D03 §2.2: Called in AI Server Actions before executing gated operations.
 *
 * Uses session.featureFlags (from JWT) — no DB query needed.
 */
export function enforceFeature(
  plan: string,
  featureFlags: Partial<FeatureFlags>,
  feature: keyof FeatureFlags,
): EnforcementResult {
  if (hasFeature(plan, featureFlags, feature)) {
    return { allowed: true };
  }

  const featureLabels: Record<keyof FeatureFlags, string> = {
    ai_matching: "AI candidate matching",
    ai_resume_parsing: "AI resume parsing",
    ai_scorecard_summarize: "AI scorecard summarization",
    bulk_import: "Bulk import",
    api_access: "API access",
    custom_fields: "Custom fields",
    white_label: "White-label branding",
    advanced_analytics: "Advanced analytics",
    nurture_sequences: "Nurture sequences",
    webhook_outbound: "Outbound webhooks",
    sso_saml: "SSO/SAML authentication",
  };

  const label = featureLabels[feature] ?? feature;
  return {
    allowed: false,
    error: `${label} is not available on the ${plan} plan. Upgrade to unlock this feature.`,
    upgradeRequired: true,
  };
}
