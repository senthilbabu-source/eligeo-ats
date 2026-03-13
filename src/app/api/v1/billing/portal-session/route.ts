import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireRoleAPI } from "@/lib/auth/api";
import { checkCsrf } from "@/lib/utils/csrf";
import { problemResponse } from "@/lib/utils/problem";
import { getStripeClient } from "@/lib/billing/stripe";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/billing/portal-session (D03 §4.5)
 *
 * Creates a Stripe Customer Portal session for managing
 * payment methods, invoices, and cancellation.
 * Owner-only (billing:manage permission).
 */
export async function POST(request: Request) {
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  const { session, error } = await requireRoleAPI("owner");
  if (error) return error;

  try {
    const stripe = getStripeClient();
    const supabase = createServiceClient();

    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", session.orgId)
      .is("deleted_at", null)
      .single();

    if (!org?.stripe_customer_id) {
      return problemResponse(400, "ATS-BI04", "No billing account", "Set up billing first by choosing a plan.");
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${baseUrl}/settings/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    Sentry.captureException(err);
    return problemResponse(500, "ATS-BI05", "Failed to create portal session");
  }
}
