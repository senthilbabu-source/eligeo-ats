/**
 * Stripe client singleton.
 *
 * All Stripe API calls are server-side only (D03 §12).
 * Uses STRIPE_SECRET_KEY from environment.
 */

import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

/**
 * Get the shared Stripe client instance.
 * Throws if STRIPE_SECRET_KEY is not configured.
 */
export function getStripeClient(): Stripe {
  if (stripeInstance) return stripeInstance;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  stripeInstance = new Stripe(key, {
    typescript: true,
  });

  return stripeInstance;
}

/**
 * Verify a Stripe webhook signature and parse the event.
 * Uses STRIPE_WEBHOOK_SECRET from environment.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
