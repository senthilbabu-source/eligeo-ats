import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import {
  verifyDropboxSignWebhook,
  DROPBOX_SIGN_EVENT_MAP,
} from "@/lib/esign/dropbox-sign";
import logger from "@/lib/utils/logger";

/**
 * Dropbox Sign webhook handler (D32 §6.2).
 *
 * Pattern: verify HMAC → dispatch to Inngest → return 200.
 * Processing is async via Inngest. The webhook handler does no DB writes.
 *
 * Dropbox Sign sends event_type at the top level of the JSON payload,
 * with signature_request nested inside event.signature_request.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const signature = request.headers.get("x-dropbox-sign-signature") ??
    request.headers.get("x-hellosign-signature") ?? "";

  if (!signature) {
    return NextResponse.json(
      { error: "Missing signature header" },
      { status: 400 },
    );
  }

  // Verify webhook signature
  if (!verifyDropboxSignWebhook(rawBody, signature)) {
    logger.warn("Dropbox Sign webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventObj = payload.event as Record<string, unknown> | undefined;
  const eventType = eventObj?.event_type as string | undefined;

  if (!eventType) {
    // Dropbox Sign sends a callback test with event_type at top level
    const topLevelType = payload.event_type as string | undefined;
    if (topLevelType === "callback_test") {
      return NextResponse.json({ received: true, handled: false });
    }
    return NextResponse.json({ error: "Missing event_type" }, { status: 400 });
  }

  // Map to Inngest event
  const mapping = DROPBOX_SIGN_EVENT_MAP[eventType];
  if (!mapping) {
    logger.info(
      { dropboxSignEventType: eventType },
      "Unhandled Dropbox Sign event type — ignoring",
    );
    return NextResponse.json({ received: true, handled: false });
  }

  const signatureRequest = eventObj!.signature_request as Record<string, unknown> | undefined;
  const signatureRequestId = signatureRequest?.signature_request_id as string | undefined;
  const metadata = signatureRequest?.metadata as Record<string, string> | undefined;

  // Dispatch to Inngest for async processing
  try {
    await inngest.send({
      name: mapping.inngestEvent,
      data: {
        dropboxSignEventType: eventType,
        signatureRequestId: signatureRequestId ?? null,
        offerId: metadata?.ats_offer_id ?? null,
        organizationId: metadata?.ats_org_id ?? null,
        targetOfferStatus: mapping.offerStatus,
      },
    });

    logger.info(
      { signatureRequestId, eventType, inngestEvent: mapping.inngestEvent },
      "Dropbox Sign webhook dispatched to Inngest",
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(
      { error: err, signatureRequestId },
      "Failed to dispatch Dropbox Sign webhook to Inngest",
    );
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true, handled: true });
}
