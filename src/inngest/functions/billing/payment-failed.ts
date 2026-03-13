import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";

/**
 * billing/payment-failed (D03 §5.4, D29 §4.1)
 *
 * Triggered when a Stripe invoice payment fails.
 * Sends dunning notification and logs warning (D03 §8.3).
 */
export const billingPaymentFailed = inngest.createFunction(
  {
    id: "billing-payment-failed",
    name: "Billing: Payment Failed",
    retries: 3,
  },
  { event: "stripe/webhook.payment-failed" },
  async ({ event, step }) => {
    const { stripeEventId, payload } = event.data as {
      stripeEventId: string;
      payload: { id: string; customer: string; attempt_count?: number };
    };

    // Find org and billing owner
    const org = await step.run("find-org", async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("organizations")
        .select("id, billing_email")
        .eq("stripe_customer_id", payload.customer)
        .is("deleted_at", null)
        .single();
      return data;
    });

    if (!org) {
      logger.warn({ stripeEventId, customer: payload.customer }, "No org found for payment failure");
      return { processed: false, reason: "org_not_found" };
    }

    // Dispatch dunning notification
    await step.sendEvent("send-dunning-notification", {
      name: "ats/notification.requested",
      data: {
        organizationId: org.id,
        eventType: "billing.payment_failed",
        variables: {
          attemptCount: payload.attempt_count ?? 1,
          billingEmail: org.billing_email,
        },
      },
    });

    logger.warn(
      { orgId: org.id, attemptCount: payload.attempt_count, stripeEventId },
      "Payment failed — dunning notification sent",
    );

    return { processed: true, orgId: org.id, attemptCount: payload.attempt_count };
  },
);
