import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { verifyWebhookSignature } from "@/lib/billing/stripe";
import logger from "@/lib/utils/logger";

/**
 * Stripe webhook handler (D03 §5).
 *
 * Pattern: verify signature → dispatch to Inngest → return 200.
 * Processing is async via Inngest functions. The webhook handler
 * itself does no DB writes — it only dispatches events.
 *
 * Stripe event types are mapped to specific Inngest event names
 * per D29 §4.1 naming convention: `stripe/webhook.{event-type}`.
 */

const STRIPE_EVENT_MAP: Record<string, string> = {
  "checkout.session.completed": "stripe/webhook.checkout-completed",
  "customer.subscription.updated": "stripe/webhook.subscription-updated",
  "customer.subscription.deleted": "stripe/webhook.subscription-canceled",
  "invoice.paid": "stripe/webhook.invoice-paid",
  "invoice.payment_failed": "stripe/webhook.payment-failed",
  "customer.subscription.trial_will_end": "stripe/webhook.trial-ending",
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // Verify webhook signature
  let event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    logger.warn({ error: err }, "Stripe webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Map to Inngest event name
  const inngestEventName = STRIPE_EVENT_MAP[event.type];
  if (!inngestEventName) {
    // Unknown event type — acknowledge but don't process
    logger.info({ stripeEventType: event.type }, "Unhandled Stripe event type — ignoring");
    return NextResponse.json({ received: true, handled: false });
  }

  // Dispatch to Inngest for async processing
  try {
    await inngest.send({
      name: inngestEventName,
      data: {
        stripeEventId: event.id,
        stripeEventType: event.type,
        payload: event.data.object,
      },
    });

    logger.info(
      { stripeEventId: event.id, stripeEventType: event.type, inngestEventName },
      "Stripe webhook dispatched to Inngest",
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error({ error: err, stripeEventId: event.id }, "Failed to dispatch Stripe webhook to Inngest");
    // Return 500 so Stripe retries
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true, handled: true });
}
