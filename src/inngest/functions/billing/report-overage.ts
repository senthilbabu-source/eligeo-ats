import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { calculateOverage } from "@/lib/billing/credits";
import logger from "@/lib/utils/logger";

/**
 * billing/report-overage (D03 §5.4, D29 §4.1)
 *
 * Cron: daily at 23:55 UTC.
 * Finds orgs with AI credit overage and reports to Stripe
 * via the Billing Meters API (D03 §6.3).
 */
export const billingReportOverage = inngest.createFunction(
  {
    id: "billing-report-overage",
    name: "Billing: Report Overage",
    retries: 3,
  },
  { cron: "55 23 * * *" },
  async ({ step }) => {
    // Step 1: Find orgs with overage
    const overageOrgs = await step.run("find-overage-orgs", async () => {
      const supabase = createServiceClient();

      // Organizations where credits used exceeds limit and they have a Stripe customer
      const { data, error } = await supabase
        .from("organizations")
        .select("id, stripe_customer_id, ai_credits_used, ai_credits_limit")
        .not("stripe_customer_id", "is", null)
        .is("deleted_at", null);

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to fetch orgs: ${error.message}`);
      }

      return (data ?? []).filter(
        (org) => org.ai_credits_used > org.ai_credits_limit,
      );
    });

    if (overageOrgs.length === 0) {
      logger.info("No orgs with AI credit overage — nothing to report");
      return { processed: true, reported: 0 };
    }

    // Step 2: Report each org's overage to Stripe
    let reported = 0;
    for (const org of overageOrgs) {
      await step.run(`report-overage-${org.id}`, async () => {
        const { getStripeClient } = await import("@/lib/billing/stripe");
        const stripe = getStripeClient();
        const overage = calculateOverage(org.ai_credits_used, org.ai_credits_limit);

        if (overage.overage_units <= 0) return;

        await stripe.billing.meterEvents.create({
          event_name: "ai_credit_overage",
          payload: {
            stripe_customer_id: org.stripe_customer_id!,
            value: String(overage.overage_units),
          },
        });

        logger.info(
          {
            orgId: org.id,
            overageCredits: overage.overage_credits,
            overageUnits: overage.overage_units,
            costCents: overage.overage_cost_cents,
          },
          "AI credit overage reported to Stripe",
        );

        reported++;
      });
    }

    return { processed: true, reported, totalOrgsChecked: overageOrgs.length };
  },
);
