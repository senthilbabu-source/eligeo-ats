import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";

/**
 * offers/withdraw
 *
 * Triggered when an offer is withdrawn. Handles:
 * 1. Void e-sign envelope if one was sent (stub for now)
 * 2. Send cancellation notification to the recruiter
 *
 * Concurrency: 5 per org. Retries: 3.
 */
export const offerWithdraw = inngest.createFunction(
  {
    id: "offers-withdraw",
    name: "Offers: Withdraw",
    retries: 3,
    concurrency: [{ scope: "fn", key: "event.data.organizationId", limit: 5 }],
  },
  { event: "ats/offer.withdrawn" },
  async ({ event, step }) => {
    const { offerId, organizationId, withdrawnBy } = event.data as {
      offerId: string;
      organizationId: string;
      withdrawnBy: string;
    };

    // ── Step 1: Fetch offer details ──────────────────────
    const offer = await step.run("fetch-offer", async () => {
      const supabase = createServiceClient();

      const { data, error } = await supabase
        .from("offers")
        .select("id, candidate_id, job_id, created_by, esign_envelope_id, esign_provider")
        .eq("id", offerId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .single();

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to fetch offer: ${error.message}`);
      }

      return data;
    });

    if (!offer) {
      logger.warn({ offerId }, "Offer not found for withdrawal processing");
      return { processed: false, reason: "offer_not_found" };
    }

    // ── Step 2: Void e-sign envelope (stub) ──────────────
    if (offer.esign_envelope_id) {
      await step.run("void-esign-envelope", async () => {
        // TODO (Phase 5): Integrate Dropbox Sign API to void envelope
        logger.info(
          { offerId, envelopeId: offer.esign_envelope_id },
          "E-sign envelope voiding — stub (Dropbox Sign integration pending)",
        );
      });
    }

    // ── Step 3: Resolve names for notification ───────────
    const context = await step.run("resolve-context", async () => {
      const supabase = createServiceClient();

      const [candRes, jobRes, recruiterRes] = await Promise.all([
        supabase.from("candidates").select("full_name").eq("id", offer.candidate_id).single(),
        supabase.from("job_openings").select("title").eq("id", offer.job_id).single(),
        supabase.from("user_profiles").select("email").eq("id", offer.created_by).single(),
      ]);

      return {
        candidateName: candRes.data?.full_name ?? "Unknown",
        jobTitle: jobRes.data?.title ?? "Unknown",
        recruiterEmail: recruiterRes.data?.email ?? null,
      };
    });

    // ── Step 4: Notify recruiter ─────────────────────────
    if (context.recruiterEmail) {
      await step.sendEvent("notify-withdrawal", {
        name: "ats/notification.requested",
        data: {
          organizationId,
          userId: offer.created_by,
          eventType: "offer.withdrawn",
          recipientEmail: context.recruiterEmail,
          variables: {
            offer: {
              id: offerId,
              candidateName: context.candidateName,
              jobTitle: context.jobTitle,
            },
            withdrawnBy,
          },
        },
      });
    }

    logger.info({ offerId, withdrawnBy }, "Offer withdrawal processed");

    return { processed: true, esignVoided: !!offer.esign_envelope_id };
  },
);
