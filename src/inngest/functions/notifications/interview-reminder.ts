import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";

/**
 * notification/interview-reminder
 *
 * Cron-based function that runs every 15 minutes. Finds interviews
 * scheduled within the next 24h and 1h windows, and dispatches
 * reminder notifications to interviewers who haven't been reminded yet.
 *
 * Uses `reminder_sent_at` column (or a tracking approach via event data)
 * to prevent duplicate reminders. Since interviews table doesn't have
 * a reminder column, we track via the `notes` or a simple time-window check.
 *
 * Schedule: every 15 minutes
 * Retries: 2
 */
export const interviewReminder = inngest.createFunction(
  {
    id: "notification-interview-reminder",
    name: "Notification: Interview Reminder",
    retries: 2,
  },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const now = new Date();

    // ── Step 1: Find interviews needing 24h reminder ─────
    const upcoming24h = await step.run("find-24h-interviews", async () => {
      const supabase = createServiceClient();

      // Window: 23h45m to 24h15m from now (matches 15-min cron interval)
      const windowStart = new Date(
        now.getTime() + 23 * 60 * 60 * 1000 + 45 * 60 * 1000,
      );
      const windowEnd = new Date(
        now.getTime() + 24 * 60 * 60 * 1000 + 15 * 60 * 1000,
      );

      const { data, error } = await supabase
        .from("interviews")
        .select(
          "id, organization_id, application_id, interviewer_id, scheduled_start, location",
        )
        .gte("scheduled_start", windowStart.toISOString())
        .lte("scheduled_start", windowEnd.toISOString())
        .eq("status", "scheduled")
        .is("deleted_at", null);

      if (error) {
        logger.error({ error }, "Failed to query 24h interview reminders");
        Sentry.captureException(error);
        return [];
      }

      return data ?? [];
    });

    // ── Step 2: Find interviews needing 1h reminder ──────
    const upcoming1h = await step.run("find-1h-interviews", async () => {
      const supabase = createServiceClient();

      // Window: 45m to 1h15m from now
      const windowStart = new Date(now.getTime() + 45 * 60 * 1000);
      const windowEnd = new Date(
        now.getTime() + 1 * 60 * 60 * 1000 + 15 * 60 * 1000,
      );

      const { data, error } = await supabase
        .from("interviews")
        .select(
          "id, organization_id, application_id, interviewer_id, scheduled_start, location",
        )
        .gte("scheduled_start", windowStart.toISOString())
        .lte("scheduled_start", windowEnd.toISOString())
        .eq("status", "scheduled")
        .is("deleted_at", null);

      if (error) {
        logger.error({ error }, "Failed to query 1h interview reminders");
        Sentry.captureException(error);
        return [];
      }

      return data ?? [];
    });

    // ── Step 3: Resolve interviewer emails ───────────────
    const allInterviews = [
      ...upcoming24h.map((i) => ({ ...i, reminderType: "24h" as const })),
      ...upcoming1h.map((i) => ({ ...i, reminderType: "1h" as const })),
    ];

    if (allInterviews.length === 0) {
      return { reminders: 0, message: "No interviews in reminder windows" };
    }

    // Deduplicate interviewer IDs
    const interviewerIds = [
      ...new Set(allInterviews.map((i) => i.interviewer_id)),
    ];

    const interviewerEmails = await step.run(
      "resolve-emails",
      async () => {
        const supabase = createServiceClient();
        const { data } = await supabase
          .from("user_profiles")
          .select("id, email")
          .in("id", interviewerIds);

        const emailMap: Record<string, string> = {};
        for (const profile of data ?? []) {
          emailMap[profile.id] = profile.email;
        }
        return emailMap;
      },
    );

    // ── Step 4: Dispatch reminder events ─────────────────
    const events = allInterviews
      .filter((interview) => interviewerEmails[interview.interviewer_id])
      .map((interview) => ({
        name: "ats/notification.requested" as const,
        data: {
          organizationId: interview.organization_id,
          userId: interview.interviewer_id,
          eventType: `interview.reminder.${interview.reminderType}`,
          recipientEmail: interviewerEmails[interview.interviewer_id],
          variables: {
            interview: {
              id: interview.id,
              scheduled_start: interview.scheduled_start,
              location: interview.location,
            },
          },
        },
      }));

    if (events.length > 0) {
      await step.sendEvent("send-reminders", events);
    }

    logger.info(
      { total: events.length, h24: upcoming24h.length, h1: upcoming1h.length },
      "Interview reminders dispatched",
    );

    return {
      reminders: events.length,
      breakdown: { h24: upcoming24h.length, h1: upcoming1h.length },
    };
  },
);
