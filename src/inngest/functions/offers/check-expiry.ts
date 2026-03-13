import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { cancelSignatureEnvelope } from "@/lib/esign/dropbox-sign";
import logger from "@/lib/utils/logger";

/**
 * offers/check-expiry
 *
 * Cron: Runs hourly. Finds sent offers past their expiry_date,
 * transitions them to 'expired', and notifies the recruiter.
 *
 * Per D06 §6: Also voids e-sign envelope if one exists (P6-3 real integration).
 *
 * Concurrency: 1 (single cron worker). Retries: 2.
 */
export const offerCheckExpiry = inngest.createFunction(
  {
    id: "offers-check-expiry",
    name: "Offers: Check Expiry",
    retries: 2,
  },
  { cron: "0 * * * *" },
  async ({ step }) => {
    const now = new Date().toISOString();

    // ── Step 1: Find expired sent offers ─────────────────
    const expiredOffers = await step.run("find-expired-offers", async () => {
      const supabase = createServiceClient();

      const { data, error } = await supabase
        .from("offers")
        .select("id, organization_id, candidate_id, job_id, created_by, esign_envelope_id")
        .eq("status", "sent")
        .lt("expiry_date", now)
        .is("deleted_at", null)
        .limit(100);

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to fetch expired offers: ${error.message}`);
      }

      return data ?? [];
    });

    if (expiredOffers.length === 0) {
      return { expired: 0, message: "No expired offers found" };
    }

    // ── Step 2: Mark all as expired ──────────────────────
    const expiredIds = expiredOffers.map((o) => o.id);
    await step.run("mark-expired", async () => {
      const supabase = createServiceClient();

      const { error } = await supabase
        .from("offers")
        .update({ status: "expired" })
        .in("id", expiredIds)
        .eq("status", "sent");

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to mark offers as expired: ${error.message}`);
      }
    });

    // ── Step 3: Void e-sign envelopes (Dropbox Sign) ─────
    const offersWithEsign = expiredOffers.filter((o) => o.esign_envelope_id);
    if (offersWithEsign.length > 0) {
      await step.run("void-esign-envelopes", async () => {
        for (const offer of offersWithEsign) {
          try {
            await cancelSignatureEnvelope(offer.esign_envelope_id!);
            logger.info(
              { offerId: offer.id, envelopeId: offer.esign_envelope_id },
              "E-sign envelope voided on offer expiry",
            );
          } catch (err) {
            // Log but don't fail expiry — envelope may already be cancelled or signed
            Sentry.captureException(err);
            logger.warn(
              { offerId: offer.id, envelopeId: offer.esign_envelope_id, error: err },
              "Failed to void e-sign envelope on expiry — continuing",
            );
          }
        }
      });
    }

    // ── Step 4: Notify recruiters ────────────────────────
    // Group by recruiter to batch notifications
    const recruiterOffers = new Map<string, typeof expiredOffers>();
    for (const offer of expiredOffers) {
      const existing = recruiterOffers.get(offer.created_by) ?? [];
      existing.push(offer);
      recruiterOffers.set(offer.created_by, existing);
    }

    const notifications: Array<{
      name: "ats/notification.requested";
      data: Record<string, unknown>;
    }> = [];

    const recruiterEmails = await step.run("resolve-recruiter-emails", async () => {
      const supabase = createServiceClient();
      const recruiterIds = [...recruiterOffers.keys()];

      const { data } = await supabase
        .from("user_profiles")
        .select("id, email")
        .in("id", recruiterIds);

      return Object.fromEntries((data ?? []).map((p) => [p.id, p.email]));
    });

    for (const [recruiterId, offers] of recruiterOffers) {
      const email = recruiterEmails[recruiterId];
      if (!email) continue;

      for (const offer of offers) {
        notifications.push({
          name: "ats/notification.requested",
          data: {
            organizationId: offer.organization_id,
            userId: recruiterId,
            eventType: "offer.expired",
            recipientEmail: email,
            variables: {
              offer: { id: offer.id },
            },
          },
        });
      }
    }

    if (notifications.length > 0) {
      await step.sendEvent("notify-expiry", notifications);
    }

    logger.info(
      { expired: expiredIds.length, notified: notifications.length },
      "Offer expiry check complete",
    );

    return { expired: expiredIds.length, notified: notifications.length };
  },
);
