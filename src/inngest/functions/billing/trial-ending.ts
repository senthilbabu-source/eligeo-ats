import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";

/**
 * billing/trial-ending (D03 §5.4, D29 §4.1)
 *
 * Triggered when a Stripe subscription trial is about to end (3 days before).
 * Sends trial-ending notification so user can add payment method.
 */
export const billingTrialEnding = inngest.createFunction(
  {
    id: "billing-trial-ending",
    name: "Billing: Trial Ending",
    retries: 3,
  },
  { event: "stripe/webhook.trial-ending" },
  async ({ event, step }) => {
    const { stripeEventId, payload } = event.data as {
      stripeEventId: string;
      payload: { id: string; customer: string; trial_end?: number };
    };

    // Find org
    const org = await step.run("find-org", async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("organizations")
        .select("id, name, billing_email")
        .eq("stripe_customer_id", payload.customer)
        .is("deleted_at", null)
        .single();
      return data;
    });

    if (!org) {
      logger.warn({ stripeEventId, customer: payload.customer }, "No org found for trial ending");
      return { processed: false, reason: "org_not_found" };
    }

    const trialEndDate = payload.trial_end
      ? new Date(payload.trial_end * 1000).toISOString()
      : null;

    // Send trial-ending notification
    await step.sendEvent("send-trial-ending-notification", {
      name: "ats/notification.requested",
      data: {
        organizationId: org.id,
        eventType: "billing.trial_ending",
        variables: {
          orgName: org.name,
          trialEndDate,
          billingEmail: org.billing_email,
        },
      },
    });

    logger.info(
      { orgId: org.id, trialEndDate, stripeEventId },
      "Trial ending notification dispatched",
    );

    return { processed: true, orgId: org.id, trialEndDate };
  },
);
