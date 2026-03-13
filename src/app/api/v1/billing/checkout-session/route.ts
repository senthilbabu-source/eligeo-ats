import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireRoleAPI } from "@/lib/auth/api";
import { checkCsrf } from "@/lib/utils/csrf";
import { problemResponse } from "@/lib/utils/problem";
import { getStripeClient } from "@/lib/billing/stripe";
import { CheckoutSessionRequestSchema } from "@/lib/billing/types";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/billing/checkout-session (D03 §4.4)
 *
 * Creates a Stripe Checkout session for subscription signup/upgrade.
 * Owner-only (billing:manage permission).
 */
export async function POST(request: Request) {
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  const { session, error } = await requireRoleAPI("owner");
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "ATS-BI01", "Invalid request body");
  }

  const parsed = CheckoutSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problemResponse(400, "ATS-BI01", "Invalid request", parsed.error.message);
  }

  const { price_id, seat_count } = parsed.data;

  try {
    const stripe = getStripeClient();
    const supabase = createServiceClient();

    // Get or create Stripe customer
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, billing_email, stripe_customer_id")
      .eq("id", session.orgId)
      .is("deleted_at", null)
      .single();

    if (!org) {
      return problemResponse(404, "ATS-BI02", "Organization not found");
    }

    let customerId = org.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        email: org.billing_email ?? undefined,
        metadata: { organization_id: org.id },
      });
      customerId = customer.id;

      await supabase
        .from("organizations")
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("id", org.id);
    }

    // Create Checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: price_id, quantity: seat_count ?? 1 }],
      success_url: `${baseUrl}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/settings/billing`,
      subscription_data: {
        metadata: { organization_id: org.id },
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    Sentry.captureException(err);
    return problemResponse(500, "ATS-BI03", "Failed to create checkout session");
  }
}
