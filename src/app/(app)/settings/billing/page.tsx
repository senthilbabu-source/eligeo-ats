/**
 * Billing settings page — plan info, usage, pricing comparison.
 * D03 §10: Server Component, owner-only (enforced by settings layout).
 */

import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlanLimits, resolveFeatureFlags } from "@/lib/billing/plans";
import { PlanCard } from "@/components/billing/plan-card";
import { PricingTable } from "@/components/billing/pricing-table";

export default async function BillingSettingsPage() {
  const session = await requireAuth();

  if (!can(session.orgRole, "billing:manage")) {
    redirect("/settings/pipelines");
  }

  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "plan, subscription_status, stripe_customer_id, stripe_subscription_id, ai_credits_used, ai_credits_limit, billing_email, trial_ends_at, feature_flags",
    )
    .eq("id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!org) {
    redirect("/settings/pipelines");
  }

  const plan = org.plan ?? "starter";
  const limits = getPlanLimits(plan);
  const features = resolveFeatureFlags(plan, (org.feature_flags as Record<string, boolean>) ?? {});

  // Count seats
  const { count: seatCount } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  // Billing cycle from Stripe subscription
  let billingCycle: string | null = null;
  let currentPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;

  if (org.stripe_subscription_id) {
    try {
      const { getStripeClient } = await import("@/lib/billing/stripe");
      const stripe = getStripeClient();
      const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
      const interval = (sub.items.data[0]?.price as { recurring?: { interval?: string } })?.recurring?.interval;
      billingCycle = interval === "year" ? "annually" : "monthly";
      const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;
      currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
      cancelAtPeriodEnd = (sub as unknown as { cancel_at_period_end: boolean }).cancel_at_period_end ?? false;
    } catch {
      // Stripe unavailable — show what we have
    }
  }

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold">Billing & Subscription</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your plan, usage, and payment details.
        </p>
      </div>

      <div className="mt-6 space-y-8">
        <PlanCard
          plan={plan}
          seatsUsed={seatCount ?? 0}
          seatsIncluded={limits.max_seats}
          aiCreditsUsed={org.ai_credits_used ?? 0}
          aiCreditsLimit={org.ai_credits_limit ?? limits.ai_credits_monthly}
          subscriptionStatus={org.subscription_status ?? "active"}
          billingCycle={billingCycle}
          currentPeriodEnd={currentPeriodEnd}
          cancelAtPeriodEnd={cancelAtPeriodEnd}
          features={features}
          isOwner={can(session.orgRole, "billing:manage")}
        />

        <div>
          <h3 className="mb-4 text-base font-semibold">Compare Plans</h3>
          <PricingTable currentPlan={plan} />
        </div>
      </div>
    </div>
  );
}
