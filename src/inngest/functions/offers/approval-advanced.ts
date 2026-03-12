import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";
import type { OfferApprovalStatus } from "@/lib/types/ground-truth";

/**
 * offers/approval-advanced
 *
 * Triggered when an approver decides (approve or reject).
 * - If approved and more approvers remain → notify next approver
 * - If approved and chain complete → offer auto-advances to 'approved'
 * - If rejected → offer returns to 'draft', all approvals reset, recruiter notified
 *
 * The auto-skip logic (G-022) is also handled here: if the next approver
 * is no longer an org member, auto-approve their slot.
 *
 * Concurrency: 10 per org. Retries: 3.
 */
export const offerApprovalAdvanced = inngest.createFunction(
  {
    id: "offers-approval-advanced",
    name: "Offers: Approval Advanced",
    retries: 3,
    concurrency: [{ scope: "fn", key: "event.data.organizationId", limit: 10 }],
  },
  { event: "ats/offer.approval-decided" },
  async ({ event, step }) => {
    const { offerId, organizationId, decision, decidedBy } = event.data as {
      offerId: string;
      organizationId: string;
      decision: "approved" | "rejected";
      decidedBy: string;
    };

    // ── Rejection path ────────────────────────────────────
    if (decision === "rejected") {
      const recruiterInfo = await step.run("find-recruiter-for-rejection", async () => {
        const supabase = createServiceClient();
        const { data: offer } = await supabase
          .from("offers")
          .select("created_by, candidate_id, job_id")
          .eq("id", offerId)
          .eq("organization_id", organizationId)
          .single();

        if (!offer) return null;

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("email")
          .eq("id", offer.created_by)
          .single();

        const { data: rejectionApproval } = await supabase
          .from("offer_approvals")
          .select("notes")
          .eq("offer_id", offerId)
          .eq("approver_id", decidedBy)
          .eq("status", "rejected")
          .single();

        const [candRes, jobRes] = await Promise.all([
          supabase.from("candidates").select("full_name").eq("id", offer.candidate_id).single(),
          supabase.from("job_openings").select("title").eq("id", offer.job_id).single(),
        ]);

        return {
          recruiterId: offer.created_by,
          email: profile?.email ?? null,
          candidateName: candRes.data?.full_name ?? "Unknown",
          jobTitle: jobRes.data?.title ?? "Unknown",
          rejectionNotes: rejectionApproval?.notes ?? null,
        };
      });

      if (recruiterInfo?.email) {
        await step.sendEvent("notify-recruiter-rejection", {
          name: "ats/notification.requested",
          data: {
            organizationId,
            userId: recruiterInfo.recruiterId,
            eventType: "offer.rejected",
            recipientEmail: recruiterInfo.email,
            variables: {
              offer: {
                id: offerId,
                candidateName: recruiterInfo.candidateName,
                jobTitle: recruiterInfo.jobTitle,
              },
              rejectedBy: decidedBy,
              rejectionNotes: recruiterInfo.rejectionNotes,
            },
          },
        });
      }

      logger.info({ offerId, rejectedBy: decidedBy }, "Offer rejection notification dispatched");
      return { result: "rejection_notified" };
    }

    // ── Approval path: check chain ────────────────────────
    const chainStatus = await step.run("check-chain-status", async () => {
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

      const pending = (approvals ?? []).filter((a) => a.status === "pending");
      const allApproved = pending.length === 0;

      return {
        allApproved,
        nextPending: pending[0] ?? null,
        totalApprovers: (approvals ?? []).length,
      };
    });

    if (chainStatus.allApproved) {
      // ── All approved → auto-advance offer to 'approved' ──
      await step.run("advance-to-approved", async () => {
        const supabase = createServiceClient();

        const { error } = await supabase
          .from("offers")
          .update({ status: "approved" })
          .eq("id", offerId)
          .eq("organization_id", organizationId)
          .eq("status", "pending_approval");

        if (error) {
          Sentry.captureException(error);
          throw new Error(`Failed to advance offer: ${error.message}`);
        }
      });

      // Notify recruiter that offer is fully approved
      const recruiterInfo = await step.run("find-recruiter", async () => {
        const supabase = createServiceClient();
        const { data: offer } = await supabase
          .from("offers")
          .select("created_by, candidate_id, job_id")
          .eq("id", offerId)
          .eq("organization_id", organizationId)
          .single();

        if (!offer) return null;

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("email")
          .eq("id", offer.created_by)
          .single();

        const [candRes, jobRes] = await Promise.all([
          supabase.from("candidates").select("full_name").eq("id", offer.candidate_id).single(),
          supabase.from("job_openings").select("title").eq("id", offer.job_id).single(),
        ]);

        return {
          recruiterId: offer.created_by,
          email: profile?.email ?? null,
          candidateName: candRes.data?.full_name ?? "Unknown",
          jobTitle: jobRes.data?.title ?? "Unknown",
        };
      });

      if (recruiterInfo?.email) {
        await step.sendEvent("notify-fully-approved", {
          name: "ats/notification.requested",
          data: {
            organizationId,
            userId: recruiterInfo.recruiterId,
            eventType: "offer.fully_approved",
            recipientEmail: recruiterInfo.email,
            variables: {
              offer: {
                id: offerId,
                candidateName: recruiterInfo.candidateName,
                jobTitle: recruiterInfo.jobTitle,
              },
            },
          },
        });
      }

      logger.info({ offerId }, "Offer fully approved — advanced to 'approved'");
      return { result: "fully_approved" };
    }

    // ── More approvers remain → check for auto-skip (G-022) then notify next ──
    if (chainStatus.nextPending) {
      const skipResult = await step.run("check-auto-skip", async () => {
        const supabase = createServiceClient();

        // Check if the next approver is still an org member
        const { data: member } = await supabase
          .from("organization_members")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("user_id", chainStatus.nextPending!.approver_id)
          .is("deleted_at", null)
          .single();

        if (member) {
          return { skipped: false };
        }

        // Auto-skip: approver no longer in org (G-022)
        const { error } = await supabase
          .from("offer_approvals")
          .update({
            status: "approved" as OfferApprovalStatus,
            decided_at: new Date().toISOString(),
            notes: "Auto-approved: approver removed from organization",
          })
          .eq("id", chainStatus.nextPending!.id)
          .eq("organization_id", organizationId);

        if (error) {
          Sentry.captureException(error);
          throw new Error(`Failed to auto-skip approver: ${error.message}`);
        }

        logger.info(
          { offerId, approverId: chainStatus.nextPending!.approver_id },
          "Auto-skipped approver (removed from org, G-022)",
        );

        return { skipped: true };
      });

      if (skipResult.skipped) {
        // Re-emit the event to re-evaluate the chain
        await step.sendEvent("re-evaluate-chain", {
          name: "ats/offer.approval-decided",
          data: {
            offerId,
            organizationId,
            decision: "approved",
            decidedBy: "system",
          },
        });

        return { result: "auto_skipped_approver", requeued: true };
      }

      // Notify the next approver
      const approverEmail = await step.run("resolve-next-approver-email", async () => {
        const supabase = createServiceClient();
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("email")
          .eq("id", chainStatus.nextPending!.approver_id)
          .single();
        return profile?.email ?? null;
      });

      if (approverEmail) {
        await step.sendEvent("notify-next-approver", {
          name: "ats/notification.requested",
          data: {
            organizationId,
            userId: chainStatus.nextPending.approver_id,
            eventType: "offer.approval_requested",
            recipientEmail: approverEmail,
            variables: {
              offer: { id: offerId },
            },
          },
        });
      }

      logger.info(
        { offerId, nextApproverId: chainStatus.nextPending.approver_id },
        "Next approver notified",
      );

      return { result: "next_approver_notified", nextApproverId: chainStatus.nextPending.approver_id };
    }

    return { result: "no_action" };
  },
);
