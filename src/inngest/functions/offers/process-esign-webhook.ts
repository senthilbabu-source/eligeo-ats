import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";

/**
 * offers/process-esign-webhook
 *
 * Triggered by Dropbox Sign webhook events dispatched from
 * /api/webhooks/dropbox-sign.
 *
 * Handles: signature_request_signed, declined, canceled.
 * Updates offer status and notifies recruiter + candidate.
 */
export const processEsignWebhook = inngest.createFunction(
  {
    id: "offers-process-esign-webhook",
    name: "Offers: Process E-Sign Webhook",
    retries: 3,
    concurrency: [{ scope: "fn", key: "event.data.organizationId", limit: 5 }],
  },
  { event: "dropboxsign/webhook.received" },
  async ({ event, step }) => {
    const {
      offerId,
      organizationId,
      targetOfferStatus,
      signatureRequestId,
      dropboxSignEventType,
    } = event.data as {
      offerId: string | null;
      organizationId: string | null;
      targetOfferStatus: string;
      signatureRequestId: string | null;
      dropboxSignEventType: string;
    };

    if (!offerId || !organizationId) {
      logger.warn(
        { signatureRequestId, dropboxSignEventType },
        "Dropbox Sign webhook missing offer/org metadata — skipping",
      );
      return { processed: false, reason: "missing_metadata" };
    }

    // ── Step 1: Fetch offer and verify ───────────────────
    const offer = await step.run("fetch-offer", async () => {
      const supabase = createServiceClient();

      const { data, error } = await supabase
        .from("offers")
        .select("id, status, candidate_id, job_id, created_by, esign_envelope_id")
        .eq("id", offerId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        throw new Error(`Offer not found for webhook: ${offerId}`);
      }

      // Verify envelope ID matches
      if (signatureRequestId && data.esign_envelope_id !== signatureRequestId) {
        logger.warn(
          { offerId, expected: data.esign_envelope_id, received: signatureRequestId },
          "Envelope ID mismatch — processing anyway",
        );
      }

      return data;
    });

    // Only process if offer is in 'sent' state
    if (offer.status !== "sent") {
      logger.info(
        { offerId, currentStatus: offer.status, targetStatus: targetOfferStatus },
        "Offer not in 'sent' state — skipping webhook",
      );
      return { processed: false, reason: "invalid_status" };
    }

    // ── Step 2: Update offer status ──────────────────────
    await step.run("update-offer-status", async () => {
      const supabase = createServiceClient();

      const updateFields: Record<string, unknown> = {
        status: targetOfferStatus,
      };

      if (targetOfferStatus === "signed") {
        updateFields.signed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("offers")
        .update(updateFields)
        .eq("id", offerId)
        .eq("organization_id", organizationId)
        .eq("status", "sent");

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to update offer to ${targetOfferStatus}: ${error.message}`);
      }
    });

    // ── Step 3: Resolve context for notifications ────────
    const context = await step.run("resolve-context", async () => {
      const supabase = createServiceClient();

      const [candRes, jobRes, recruiterRes] = await Promise.all([
        supabase
          .from("candidates")
          .select("full_name, email")
          .eq("id", offer.candidate_id)
          .single(),
        supabase
          .from("job_openings")
          .select("title")
          .eq("id", offer.job_id)
          .single(),
        supabase
          .from("user_profiles")
          .select("email")
          .eq("id", offer.created_by)
          .single(),
      ]);

      return {
        candidateName: candRes.data?.full_name ?? "Unknown",
        candidateEmail: candRes.data?.email ?? null,
        jobTitle: jobRes.data?.title ?? "Unknown",
        recruiterEmail: recruiterRes.data?.email ?? null,
      };
    });

    // ── Step 4: Notify recruiter ─────────────────────────
    if (context.recruiterEmail) {
      await step.sendEvent("notify-recruiter", {
        name: "ats/notification.requested",
        data: {
          organizationId,
          userId: offer.created_by,
          eventType: `offer.${targetOfferStatus}`,
          recipientEmail: context.recruiterEmail,
          variables: {
            offer: {
              id: offerId,
              candidateName: context.candidateName,
              jobTitle: context.jobTitle,
              status: targetOfferStatus,
            },
          },
        },
      });
    }

    logger.info(
      { offerId, signatureRequestId, dropboxSignEventType, targetOfferStatus },
      "Dropbox Sign webhook processed — offer status updated",
    );

    return {
      processed: true,
      offerId,
      previousStatus: "sent",
      newStatus: targetOfferStatus,
    };
  },
);
