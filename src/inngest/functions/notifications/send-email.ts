import * as Sentry from "@sentry/nextjs";
import { Resend } from "resend";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { renderTemplate } from "@/lib/notifications/render-template";
import logger from "@/lib/utils/logger";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * notification/send-email
 *
 * Loads an email template from the database, renders it with provided
 * variables, and sends via Resend. Falls back to a plain-text email
 * if no templateId is provided.
 *
 * Triggered by: `ats/notification.send-email` (from dispatch function)
 * Retries: 3 (Resend is idempotent by message ID)
 * Concurrency: 10 per org to respect Resend rate limits
 */
export const sendEmailNotification = inngest.createFunction(
  {
    id: "notification-send-email",
    name: "Notification: Send Email",
    retries: 3,
    concurrency: [
      { scope: "fn", key: "event.data.organizationId", limit: 10 },
    ],
  },
  { event: "ats/notification.send-email" },
  async ({ event, step }) => {
    const {
      organizationId,
      recipientEmail,
      templateId,
      variables,
      eventType,
    } = event.data as {
      organizationId: string;
      userId: string;
      recipientEmail: string;
      templateId?: string;
      variables: Record<string, unknown>;
      eventType: string;
    };

    // ── Step 1: Load and render template ─────────────────
    const rendered = await step.run("render-template", async () => {
      if (!templateId) {
        // No template — send a minimal fallback
        return {
          subject: `Notification: ${eventType}`,
          html: `<p>You have a new notification: ${eventType}</p>`,
          text: `You have a new notification: ${eventType}`,
        };
      }

      const supabase = createServiceClient();
      const { data: template, error } = await supabase
        .from("email_templates")
        .select("subject, body_html, body_text")
        .eq("id", templateId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error || !template) {
        logger.error(
          { error, templateId },
          "Failed to load email template for sending",
        );
        throw new Error(`Template ${templateId} not found`);
      }

      const subject = renderTemplate(template.subject, variables, {
        escapeValues: false,
      });
      const html = renderTemplate(template.body_html, variables);
      const text = template.body_text
        ? renderTemplate(template.body_text, variables, {
            escapeValues: false,
          })
        : undefined;

      return { subject, html, text };
    });

    // ── Step 2: Send via Resend ──────────────────────────
    const result = await step.run("send-resend", async () => {
      const fromAddress =
        process.env.EMAIL_FROM ?? "notifications@app.eligeo.io";

      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to: recipientEmail,
        subject: rendered.subject,
        html: rendered.html,
        ...(rendered.text && { text: rendered.text }),
      });

      if (error) {
        logger.error({ error, recipientEmail }, "Resend email send failed");
        Sentry.captureException(error);
        throw new Error(`Resend error: ${error.message}`);
      }

      return { emailId: data?.id };
    });

    logger.info(
      { recipientEmail, eventType, emailId: result.emailId },
      "Email notification sent",
    );

    return { sent: true, emailId: result.emailId };
  },
);
