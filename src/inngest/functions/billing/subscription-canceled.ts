import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import logger from "@/lib/utils/logger";

/**
 * billing/subscription-canceled (D03 §5.4, D29 §4.1)
 *
 * Triggered when a Stripe subscription is deleted (final cancellation).
 * Downgrades organization to starter plan, resets feature flags.
 */
export const billingSubscriptionCanceled = inngest.createFunction(
  {
    id: "billing-subscription-canceled",
    name: "Billing: Subscription Canceled",
    retries: 3,
  },
  { event: "stripe/webhook.subscription-canceled" },
  async ({ event, step }) => {
    const { stripeEventId, payload } = event.data as {
      stripeEventId: string;
      payload: { id: string; customer: string };
    };

    // Find org
    const org = await step.run("find-org", async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("organizations")
        .select("id, plan")
        .eq("stripe_customer_id", payload.customer)
        .is("deleted_at", null)
        .single();
      return data;
    });

    if (!org) {
      logger.warn({ stripeEventId, customer: payload.customer }, "No org found for subscription cancellation");
      return { processed: false, reason: "org_not_found" };
    }

    // Downgrade to starter
    await step.run("downgrade-to-starter", async () => {
      const supabase = createServiceClient();
      const { error } = await supabase
        .from("organizations")
        .update({
          plan: "starter",
          subscription_status: "canceled",
          ai_credits_limit: PLAN_LIMITS.starter.ai_credits_monthly,
          feature_flags: {},
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", org.id)
        .is("deleted_at", null);

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to downgrade org: ${error.message}`);
      }
    });

    // Send cancellation notification
    await step.sendEvent("send-cancellation-notification", {
      name: "ats/notification.requested",
      data: {
        organizationId: org.id,
        eventType: "billing.subscription_canceled",
        variables: { previousPlan: org.plan },
      },
    });

    logger.info(
      { orgId: org.id, previousPlan: org.plan, stripeEventId },
      "Subscription canceled — downgraded to starter",
    );

    return { processed: true, orgId: org.id, previousPlan: org.plan };
  },
);
