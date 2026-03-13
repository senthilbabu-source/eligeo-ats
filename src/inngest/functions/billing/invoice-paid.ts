import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";

/**
 * billing/invoice-paid (D03 §5.4, D29 §4.1)
 *
 * Triggered when a Stripe invoice is paid (start of new billing period).
 * Resets AI credits for the organization (D03 §6.2).
 */
export const billingInvoicePaid = inngest.createFunction(
  {
    id: "billing-invoice-paid",
    name: "Billing: Invoice Paid",
    retries: 3,
  },
  { event: "stripe/webhook.invoice-paid" },
  async ({ event, step }) => {
    const { stripeEventId, payload } = event.data as {
      stripeEventId: string;
      payload: { id: string; customer: string; subscription?: string };
    };

    // Reset AI credits
    const result = await step.run("reset-credits", async () => {
      const supabase = createServiceClient();

      const { data, error } = await supabase
        .from("organizations")
        .update({
          ai_credits_used: 0,
          subscription_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", payload.customer)
        .is("deleted_at", null)
        .select("id, plan, ai_credits_limit")
        .single();

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to reset credits: ${error.message}`);
      }

      return data;
    });

    if (!result) {
      logger.warn({ stripeEventId, customer: payload.customer }, "No org found for invoice paid");
      return { processed: false, reason: "org_not_found" };
    }

    logger.info(
      { orgId: result.id, plan: result.plan, creditLimit: result.ai_credits_limit, stripeEventId },
      "Invoice paid — AI credits reset",
    );

    return { processed: true, orgId: result.id, creditsReset: true };
  },
);
