import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";

/**
 * notification/dispatch
 *
 * Central dispatcher for all notification events. Looks up the user's
 * notification preferences and fans out to the appropriate channel(s):
 * - "in_app" → inserts into a future in-app notifications table (stub for now)
 * - "email"  → sends `ats/notification.send-email` event
 * - "both"   → does both
 * - "none"   → suppressed
 *
 * If no preference exists for the event type, defaults to "email".
 *
 * Triggered by: `ats/notification.requested`
 * Retries: 3
 */
export const dispatchNotification = inngest.createFunction(
  {
    id: "notification-dispatch",
    name: "Notification: Dispatch",
    retries: 3,
  },
  { event: "ats/notification.requested" },
  async ({ event, step }) => {
    const {
      organizationId,
      userId,
      eventType,
      templateId,
      variables,
      recipientEmail,
    } = event.data as {
      organizationId: string;
      userId: string;
      eventType: string;
      templateId?: string;
      variables?: Record<string, unknown>;
      recipientEmail: string;
    };

    // ── Step 1: Look up user preference ──────────────────
    const channel = await step.run("lookup-preference", async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("notification_preferences")
        .select("channel")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .eq("event_type", eventType)
        .is("deleted_at", null)
        .maybeSingle();

      // Default to "email" if no preference set
      return (data?.channel as string) ?? "email";
    });

    if (channel === "none") {
      logger.info(
        { userId, eventType },
        "Notification suppressed by user preference",
      );
      return { dispatched: false, reason: "suppressed" };
    }

    const results: { inApp?: boolean; email?: boolean } = {};

    // ── Step 2: In-app notification (stub) ───────────────
    if (channel === "in_app" || channel === "both") {
      await step.run("dispatch-in-app", async () => {
        // TODO: Insert into in_app_notifications table when it exists.
        // For now, just log that we would have sent an in-app notification.
        logger.info(
          { userId, eventType },
          "In-app notification dispatched (stub)",
        );
        return { sent: true };
      });
      results.inApp = true;
    }

    // ── Step 3: Email notification ───────────────────────
    if (channel === "email" || channel === "both") {
      await step.sendEvent("dispatch-email", {
        name: "ats/notification.send-email",
        data: {
          organizationId,
          userId,
          recipientEmail,
          templateId,
          variables: variables ?? {},
          eventType,
        },
      });
      results.email = true;
    }

    logger.info(
      { userId, eventType, channel },
      "Notification dispatched",
    );

    return { dispatched: true, channel, ...results };
  },
);
