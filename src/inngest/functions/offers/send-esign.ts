import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";

/**
 * offers/send-esign
 *
 * Triggered when a recruiter sends an approved offer.
 * Steps:
 * 1. Generate offer PDF (stub — will use offer letter text)
 * 2. Create Dropbox Sign envelope (stub for Phase 5)
 * 3. Update offer status to 'sent' with sent_at timestamp
 * 4. Notify recruiter that offer was sent
 *
 * Per D06 §4.2: Retries 5 times with exponential backoff.
 * If all retries fail, offer stays 'approved' and recruiter is notified.
 *
 * Concurrency: 5 per org. Retries: 5 (for external API reliability).
 */
export const offerSendEsign = inngest.createFunction(
  {
    id: "offers-send-esign",
    name: "Offers: Send E-Sign",
    retries: 5,
    concurrency: [{ scope: "fn", key: "event.data.organizationId", limit: 5 }],
  },
  { event: "ats/offer.send-requested" },
  async ({ event, step }) => {
    const { offerId, organizationId, requestedBy: _requestedBy } = event.data as {
      offerId: string;
      organizationId: string;
      requestedBy: string;
    };

    // ── Step 1: Fetch offer details ──────────────────────
    const offer = await step.run("fetch-offer", async () => {
      const supabase = createServiceClient();

      const { data, error } = await supabase
        .from("offers")
        .select("id, candidate_id, job_id, created_by, compensation, terms, esign_provider, status")
        .eq("id", offerId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        Sentry.captureException(error);
        throw new Error(`Offer not found: ${offerId}`);
      }

      if (data.status !== "approved") {
        throw new Error(`Offer must be approved to send, current status: ${data.status}`);
      }

      return data;
    });

    // ── Step 2: Resolve candidate and job info ───────────
    const context = await step.run("resolve-context", async () => {
      const supabase = createServiceClient();

      const [candRes, jobRes] = await Promise.all([
        supabase.from("candidates").select("full_name, email").eq("id", offer.candidate_id).single(),
        supabase.from("job_openings").select("title").eq("id", offer.job_id).single(),
      ]);

      return {
        candidateName: candRes.data?.full_name ?? "Unknown",
        candidateEmail: candRes.data?.email ?? null,
        jobTitle: jobRes.data?.title ?? "Unknown",
      };
    });

    // ── Step 3: Create e-sign envelope (stub) ────────────
    const envelopeId = await step.run("create-esign-envelope", async () => {
      // TODO (Phase 5): Integrate Dropbox Sign API
      // 1. Generate PDF from offer letter text + compensation
      // 2. Create signature request via Dropbox Sign
      // 3. Return envelope ID
      logger.info(
        { offerId, provider: offer.esign_provider },
        "E-sign envelope creation — stub (Dropbox Sign integration pending)",
      );

      // Return null since integration is not yet built
      return null as string | null;
    });

    // ── Step 4: Update offer to 'sent' ───────────────────
    await step.run("update-offer-sent", async () => {
      const supabase = createServiceClient();

      const { error } = await supabase
        .from("offers")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          ...(envelopeId ? { esign_envelope_id: envelopeId } : {}),
        })
        .eq("id", offerId)
        .eq("organization_id", organizationId)
        .eq("status", "approved");

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to update offer status to sent: ${error.message}`);
      }
    });

    // ── Step 5: Notify recruiter ─────────────────────────
    const recruiterEmail = await step.run("resolve-recruiter-email", async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("user_profiles")
        .select("email")
        .eq("id", offer.created_by)
        .single();
      return data?.email ?? null;
    });

    if (recruiterEmail) {
      await step.sendEvent("notify-offer-sent", {
        name: "ats/notification.requested",
        data: {
          organizationId,
          userId: offer.created_by,
          eventType: "offer.sent",
          recipientEmail: recruiterEmail,
          variables: {
            offer: {
              id: offerId,
              candidateName: context.candidateName,
              candidateEmail: context.candidateEmail,
              jobTitle: context.jobTitle,
            },
          },
        },
      });
    }

    logger.info(
      { offerId, candidateEmail: context.candidateEmail },
      "Offer sent for e-signature",
    );

    return {
      sent: true,
      envelopeId,
      candidateEmail: context.candidateEmail,
    };
  },
);
