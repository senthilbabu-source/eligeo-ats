import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireAuthAPI } from "@/lib/auth/api";
import { problemResponse } from "@/lib/utils/problem";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlanLimits, resolveFeatureFlags } from "@/lib/billing/plans";
import { calculateExtraSeats } from "@/lib/billing/seats";

/**
 * GET /api/v1/billing/plan (D03 §9)
 *
 * Returns current plan details, seat/credit counts, and resolved feature flags.
 * Available to any authenticated org member.
 */
export async function GET() {
  const { session, error } = await requireAuthAPI();
  if (error) return error;

  try {
    const supabase = createServiceClient();

    // Get org details
    const { data: org } = await supabase
      .from("organizations")
      .select("plan, ai_credits_used, ai_credits_limit, stripe_customer_id, feature_flags, subscription_status")
      .eq("id", session.orgId)
      .is("deleted_at", null)
      .single();

    if (!org) {
      return problemResponse(404, "ATS-BI02", "Organization not found");
    }

    // Count active seats
    const { count: seatCount } = await supabase
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", session.orgId)
      .is("deleted_at", null);

    const seatsUsed = seatCount ?? 0;
    const limits = getPlanLimits(org.plan);
    const seatsIncluded = limits.max_seats;
    const seatsExtra = calculateExtraSeats(org.plan, seatsUsed);
    const features = resolveFeatureFlags(org.plan, org.feature_flags ?? {});

    // Get billing cycle info from Stripe if available
    let billingCycle: "monthly" | "annual" | null = null;
    let currentPeriodEnd: string | null = null;
    let cancelAtPeriodEnd = false;

    if (org.stripe_customer_id) {
      try {
        const { getStripeClient } = await import("@/lib/billing/stripe");
        const stripe = getStripeClient();
        const subscriptions = await stripe.subscriptions.list({
          customer: org.stripe_customer_id,
          limit: 1,
        });
        const sub = subscriptions.data[0];
        if (sub) {
          const interval = sub.items.data[0]?.price.recurring?.interval;
          billingCycle = interval === "year" ? "annual" : "monthly";
          // current_period_end is a Unix timestamp on the subscription object
          const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;
          currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
          cancelAtPeriodEnd = sub.cancel_at_period_end;
        }
      } catch {
        // Stripe unavailable — return plan info without billing cycle details
      }
    }

    return NextResponse.json({
      plan: org.plan,
      seats_used: seatsUsed,
      seats_included: seatsIncluded,
      seats_extra: seatsExtra,
      ai_credits_used: org.ai_credits_used,
      ai_credits_limit: org.ai_credits_limit,
      features,
      billing_cycle: billingCycle,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
    });
  } catch (err) {
    Sentry.captureException(err);
    return problemResponse(500, "ATS-BI07", "Failed to fetch plan details");
  }
}
