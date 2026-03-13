import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";

/**
 * screening/send-reminder
 *
 * D32 §7.7 #4 — Delayed: 48h after invite.
 * If session is still pending, send a reminder email.
 */
export const screeningSendReminder = inngest.createFunction(
  {
    id: "screening-send-reminder",
    name: "Screening: Send Reminder",
    retries: 2,
  },
  { event: "ats/screening.reminder-due" },
  async ({ event, step }) => {
    const { sessionId, organizationId, candidateId } = event.data as {
      sessionId: string;
      organizationId: string;
      candidateId: string;
    };

    // Check if session is still pending
    const shouldRemind = await step.run("check-session-status", async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("screening_sessions")
        .select("status")
        .eq("id", sessionId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .single();

      return data?.status === "pending";
    });

    if (!shouldRemind) {
      logger.debug({ sessionId }, "Session no longer pending — skipping reminder");
      return { skipped: true };
    }

    // Send reminder
    await step.run("send-reminder-email", async () => {
      const supabase = createServiceClient();

      const { data: candidate } = await supabase
        .from("candidates")
        .select("email, first_name")
        .eq("id", candidateId)
        .single();

      if (!candidate?.email) return;

      await inngest.send({
        name: "ats/notification.requested",
        data: {
          type: "screening.reminder",
          organizationId,
          recipientEmail: candidate.email,
          recipientName: candidate.first_name ?? "Candidate",
          metadata: { sessionId },
        },
      });
    });

    return { reminded: true };
  },
);
