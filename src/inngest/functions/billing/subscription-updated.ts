import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlanLimits, isValidPlan } from "@/lib/billing/plans";
import logger from "@/lib/utils/logger";

/**
 * billing/subscription-updated (D03 §5.4, D29 §4.1)
 *
 * Triggered when a Stripe subscription is updated.
 * Syncs plan tier, AI credit limit, and subscription status.
 */
export const billingSubscriptionUpdated = inngest.createFunction(
  {
    id: "billing-subscription-updated",
    name: "Billing: Subscription Updated",
    retries: 3,
  },
  { event: "stripe/webhook.subscription-updated" },
  async ({ event, step }) => {
    const { stripeEventId, payload } = event.data as {
      stripeEventId: string;
      payload: {
        id: string;
        customer: string;
        status: string;
        cancel_at_period_end?: boolean;
        metadata?: { organization_id?: string };
        items?: { data: Array<{ price: { product: string } }> };
      };
    };

    // Find org by stripe_customer_id
    const org = await step.run("find-org", async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("organizations")
        .select("id, plan")
        .eq("stripe_customer_id", payload.customer as string)
        .is("deleted_at", null)
        .single();
      return data;
    });

    if (!org) {
      logger.warn({ stripeEventId, customer: payload.customer }, "No org found for subscription update");
      return { processed: false, reason: "org_not_found" };
    }

    // Resolve new plan tier from subscription product
    const newPlan = await step.run("resolve-plan", async () => {
      const { getStripeClient } = await import("@/lib/billing/stripe");
      const stripe = getStripeClient();
      const productId = payload.items?.data[0]?.price.product;
      if (!productId) return org.plan;
      const product = await stripe.products.retrieve(productId as string);
      return product.metadata.plan_tier ?? org.plan;
    });

    const plan = isValidPlan(newPlan) ? newPlan : org.plan;
    const limits = getPlanLimits(plan);

    // Map Stripe status to our subscription_status
    const statusMap: Record<string, string> = {
      trialing: "trialing",
      active: "active",
      past_due: "past_due",
      canceled: "canceled",
      unpaid: "unpaid",
      incomplete: "active",
      incomplete_expired: "canceled",
    };
    const subscriptionStatus = statusMap[payload.status] ?? "active";

    // Update organization
    await step.run("update-org", async () => {
      const supabase = createServiceClient();
      const { error } = await supabase
        .from("organizations")
        .update({
          plan,
          subscription_status: subscriptionStatus,
          ai_credits_limit: limits.ai_credits_monthly,
          updated_at: new Date().toISOString(),
        })
        .eq("id", org.id)
        .is("deleted_at", null);

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to update org: ${error.message}`);
      }
    });

    logger.info(
      { orgId: org.id, plan, subscriptionStatus, stripeEventId },
      "Subscription updated — org synced",
    );

    return { processed: true, orgId: org.id, plan, subscriptionStatus };
  },
);
