import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { generateDailyBriefing } from "@/inngest/functions/analytics/generate-briefing";
import { generateCandidateEmbedding } from "@/inngest/functions/ai/generate-candidate-embedding";
import { dispatchNotification } from "@/inngest/functions/notifications/dispatch";
import { sendEmailNotification } from "@/inngest/functions/notifications/send-email";
import { interviewReminder } from "@/inngest/functions/notifications/interview-reminder";

/**
 * Inngest endpoint — serves all registered background functions.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    generateDailyBriefing,
    generateCandidateEmbedding,
    dispatchNotification,
    sendEmailNotification,
    interviewReminder,
  ],
});
