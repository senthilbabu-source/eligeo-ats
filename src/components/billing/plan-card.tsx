/**
 * Current plan display card with usage meters and upgrade CTA.
 * D03 §10: PlanCard component.
 */

import { UsageMeter } from "./usage-meter";
import { formatInTz } from "@/lib/datetime";
import type { FeatureFlags } from "@/lib/types/ground-truth";

interface PlanCardProps {
  plan: string;
  seatsUsed: number;
  seatsIncluded: number;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  subscriptionStatus: string;
  billingCycle: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  features: FeatureFlags;
  isOwner: boolean;
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
  enterprise: "Enterprise",
};

export function PlanCard({
  plan,
  seatsUsed,
  seatsIncluded,
  aiCreditsUsed,
  aiCreditsLimit,
  subscriptionStatus,
  billingCycle,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  isOwner,
}: PlanCardProps) {
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const statusLabel = subscriptionStatus === "trialing" ? "Trial" : subscriptionStatus;

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{planLabel} Plan</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {statusLabel}
            </span>
            {billingCycle && (
              <span>Billed {billingCycle}</span>
            )}
          </div>
        </div>
        {isOwner && plan !== "enterprise" && (
          <form action="/api/v1/billing/checkout-session" method="POST">
            <a
              href="/settings/billing#pricing"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Upgrade
            </a>
          </form>
        )}
      </div>

      {cancelAtPeriodEnd && currentPeriodEnd && (
        <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your plan will be canceled on{" "}
          {formatInTz(currentPeriodEnd, "UTC", "long")}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <UsageMeter
          label="Seats"
          used={seatsUsed}
          limit={seatsIncluded}
        />
        <UsageMeter
          label="AI Credits"
          used={aiCreditsUsed}
          limit={aiCreditsLimit}
          unit="this period"
        />
      </div>

      {isOwner && (
        <div className="mt-6 border-t pt-4">
          <a
            href="/api/v1/billing/portal-session"
            className="text-sm font-medium text-primary hover:underline"
            data-portal-link
          >
            Manage payment methods & invoices
          </a>
        </div>
      )}
    </div>
  );
}
