/**
 * Plan comparison pricing table.
 * D03 §10: PricingTable component.
 */

import { PLAN_PRICING, PLAN_LIMITS, PLAN_FEATURE_DEFAULTS, type PlanTier } from "@/lib/billing/plans";

interface PricingTableProps {
  currentPlan: string;
}

const TIER_ORDER: PlanTier[] = ["starter", "growth", "pro", "enterprise"];
const TIER_LABELS: Record<PlanTier, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
  enterprise: "Enterprise",
};

const FEATURE_LABELS: { key: string; label: string }[] = [
  { key: "max_seats", label: "Included seats" },
  { key: "max_active_jobs", label: "Active jobs" },
  { key: "ai_credits_monthly", label: "AI credits/month" },
  { key: "ai_resume_parsing", label: "AI resume parsing" },
  { key: "ai_matching", label: "AI candidate matching" },
  { key: "ai_scorecard_summarize", label: "AI scorecard summary" },
  { key: "custom_fields", label: "Custom fields" },
  { key: "bulk_import", label: "Bulk import" },
  { key: "api_access", label: "API access" },
  { key: "advanced_analytics", label: "Advanced analytics" },
  { key: "webhook_outbound", label: "Outbound webhooks" },
  { key: "white_label", label: "White-label" },
  { key: "sso_saml", label: "SSO/SAML" },
];

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

export function PricingTable({ currentPlan }: PricingTableProps) {
  return (
    <div id="pricing" className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="pb-3 pr-4 text-left font-medium text-muted-foreground">Feature</th>
            {TIER_ORDER.map((tier) => (
              <th key={tier} className="pb-3 px-4 text-center font-medium">
                <div>{TIER_LABELS[tier]}</div>
                <div className="mt-1 text-xs font-normal text-muted-foreground">
                  {tier === "enterprise"
                    ? "Custom"
                    : `$${(PLAN_PRICING[tier].monthly / 100).toFixed(0)}/mo`}
                </div>
                {tier === currentPlan && (
                  <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Current
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEATURE_LABELS.map(({ key, label }) => (
            <tr key={key} className="border-b last:border-0">
              <td className="py-3 pr-4 text-muted-foreground">{label}</td>
              {TIER_ORDER.map((tier) => {
                const val = formatValue(key, tier);
                return (
                  <td key={tier} className={`py-3 px-4 text-center ${val === "✓" ? "text-green-600" : val === "—" ? "text-muted-foreground" : ""}`}>
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
