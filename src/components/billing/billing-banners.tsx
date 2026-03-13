/**
 * Wrapper that renders the appropriate billing banner based on org state.
 * D03 §10: Mounted in app layout, reads session + org data.
 */

import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";
import { getPlanLimits } from "@/lib/billing/plans";
import { TrialBanner } from "./trial-banner";
import { UpgradeBanner } from "./upgrade-banner";
import { PaymentFailedBanner } from "./payment-failed-banner";

export async function BillingBanners() {
  const session = await getSession();
  if (!session) return null;

  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "plan, subscription_status, ai_credits_used, ai_credits_limit, trial_ends_at",
    )
    .eq("id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!org) return null;

  const plan = org.plan ?? "starter";
  const status = org.subscription_status ?? "active";
  const isOwner = can(session.orgRole, "billing:manage");
  const limits = getPlanLimits(plan);

  // Count seats for upgrade banner
  const { count: seatCount } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  // Priority: payment failed > trial ending > upgrade nudge
  if (status === "past_due") {
    return <PaymentFailedBanner subscriptionStatus={status} isOwner={isOwner} />;
  }

  if (status === "trialing" && org.trial_ends_at) {
    return (
      <TrialBanner
        trialEndsAt={org.trial_ends_at}
        plan={plan}
        isOwner={isOwner}
      />
    );
  }

  return (
    <UpgradeBanner
      plan={plan}
      seatsUsed={seatCount ?? 0}
      seatsIncluded={limits.max_seats}
      aiCreditsUsed={org.ai_credits_used ?? 0}
      aiCreditsLimit={org.ai_credits_limit ?? limits.ai_credits_monthly}
      isOwner={isOwner}
    />
  );
}
