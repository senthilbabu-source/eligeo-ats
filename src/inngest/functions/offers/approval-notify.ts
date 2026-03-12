import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";

/**
 * offers/approval-notify
 *
 * Triggered when an offer is submitted for approval.
 * Finds the first pending approver in the chain and dispatches
 * a notification (via the notification system) so they know
 * it is their turn to act.
 *
 * Concurrency: 10 per org. Retries: 3.
 */
export const offerApprovalNotify = inngest.createFunction(
  {
    id: "offers-approval-notify",
    name: "Offers: Approval Notify",
    retries: 3,
    concurrency: [{ scope: "fn", key: "event.data.organizationId", limit: 10 }],
  },
  { event: "ats/offer.submitted" },
  async ({ event, step }) => {
    const { offerId, organizationId, submittedBy } = event.data as {
      offerId: string;
      organizationId: string;
      submittedBy: string;
    };

    // ── Step 1: Find next pending approver ──────────────
    const approver = await step.run("find-next-approver", async () => {
      const supabase = createServiceClient();

      const { data: approvals, error } = await supabase
        .from("offer_approvals")
        .select("id, approver_id, sequence_order, status")
        .eq("offer_id", offerId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("sequence_order", { ascending: true });

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to fetch approvals: ${error.message}`);
      }

      const nextPending = (approvals ?? []).find((a) => a.status === "pending");
      if (!nextPending) {
        return null;
      }

      // Resolve approver email
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("email")
        .eq("id", nextPending.approver_id)
        .single();

      return {
        approvalId: nextPending.id,
        approverId: nextPending.approver_id,
        email: profile?.email ?? null,
      };
    });

    if (!approver) {
      logger.info({ offerId }, "No pending approvers found — skipping notification");
      return { notified: false, reason: "no_pending_approvers" };
    }

    if (!approver.email) {
      logger.warn(
        { offerId, approverId: approver.approverId },
        "Approver email not found — skipping notification",
      );
      return { notified: false, reason: "approver_email_missing" };
    }

    // ── Step 2: Fetch offer context for notification ─────
    const offerContext = await step.run("fetch-offer-context", async () => {
      const supabase = createServiceClient();

      const { data: offer } = await supabase
        .from("offers")
        .select("id, candidate_id, job_id")
        .eq("id", offerId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .single();

      if (!offer) return null;

      // Resolve candidate name and job title
      const [candidateRes, jobRes] = await Promise.all([
        supabase
          .from("candidates")
          .select("full_name")
          .eq("id", offer.candidate_id)
          .single(),
        supabase
          .from("job_openings")
          .select("title")
          .eq("id", offer.job_id)
          .single(),
      ]);

      return {
        candidateName: candidateRes.data?.full_name ?? "Unknown",
        jobTitle: jobRes.data?.title ?? "Unknown",
      };
    });

    // ── Step 3: Dispatch notification ────────────────────
    await step.sendEvent("send-approval-notification", {
      name: "ats/notification.requested",
      data: {
        organizationId,
        userId: approver.approverId,
        eventType: "offer.approval_requested",
        recipientEmail: approver.email,
        variables: {
          offer: {
            id: offerId,
            candidateName: offerContext?.candidateName ?? "Unknown",
            jobTitle: offerContext?.jobTitle ?? "Unknown",
          },
          submittedBy,
        },
      },
    });

    logger.info(
      { offerId, approverId: approver.approverId },
      "Offer approval notification dispatched",
    );

    return { notified: true, approverId: approver.approverId };
  },
);
