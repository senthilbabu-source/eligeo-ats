import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { generateDailyBriefing } from "@/inngest/functions/analytics/generate-briefing";

/**
 * Inngest endpoint — serves all registered background functions.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateDailyBriefing],
});
