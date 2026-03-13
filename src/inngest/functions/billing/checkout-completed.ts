import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlanLimits, isValidPlan } from "@/lib/billing/plans";
import logger from "@/lib/utils/logger";

/**
 * billing/checkout-completed (D03 §5.4, D29 §4.1)
 *
 * Triggered when a Stripe Checkout session completes.
 * Sets organization plan, AI credit limit, and resets usage.
 */
export const billingCheckoutCompleted = inngest.createFunction(
  {
    id: "billing-checkout-completed",
    name: "Billing: Checkout Completed",
    retries: 3,
  },
  { event: "stripe/webhook.checkout-completed" },
  async ({ event, step }) => {
    const { stripeEventId, payload } = event.data as {
      stripeEventId: string;
      payload: {
        id: string;
        customer: string;
        subscription: string;
        metadata?: { organization_id?: string };
      };
    };

    // Resolve org ID — from metadata or by stripe_customer_id lookup
    let resolvedOrgId = payload.metadata?.organization_id;
    if (!resolvedOrgId) {
      const org = await step.run("find-org-by-customer", async () => {
        const supabase = createServiceClient();
        const { data } = await supabase
          .from("organizations")
          .select("id")
          .eq("stripe_customer_id", payload.customer)
          .is("deleted_at", null)
          .single();
        return data;
      });

      if (!org) {
        logger.warn({ stripeEventId, customer: payload.customer }, "No org found for checkout — skipping");
        return { processed: false, reason: "org_not_found" };
      }
      resolvedOrgId = org.id;
    }

    const orgId = resolvedOrgId;

    // Step 1: Resolve plan from Stripe subscription
    const planInfo = await step.run("resolve-plan", async () => {
      const { getStripeClient } = await import("@/lib/billing/stripe");
      const stripe = getStripeClient();
      const subscription = await stripe.subscriptions.retrieve(payload.subscription);
      const productId = subscription.items.data[0]?.price.product as string;
      const product = await stripe.products.retrieve(productId);
      const planTier = product.metadata.plan_tier ?? "starter";
      return { planTier, subscriptionId: subscription.id };
    });

    const plan = isValidPlan(planInfo.planTier) ? planInfo.planTier : "starter";
    const limits = getPlanLimits(plan);

    // Step 2: Update organization
    await step.run("update-org", async () => {
      const supabase = createServiceClient();
      const { error } = await supabase
        .from("organizations")
        .update({
          plan,
          subscription_status: "active",
          stripe_customer_id: payload.customer,
          stripe_subscription_id: planInfo.subscriptionId,
          ai_credits_used: 0,
          ai_credits_limit: limits.ai_credits_monthly,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orgId)
        .is("deleted_at", null);

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to update org: ${error.message}`);
      }
    });

    // Step 3: Send welcome notification
    await step.sendEvent("send-welcome", {
      name: "ats/notification.requested",
      data: {
        organizationId: orgId,
        eventType: "billing.checkout_completed",
        variables: { plan },
      },
    });

    logger.info({ orgId, plan, stripeEventId }, "Checkout completed — plan activated");
    return { processed: true, orgId, plan };
  },
);
