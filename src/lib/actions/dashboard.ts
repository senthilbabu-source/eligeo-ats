"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { requireAuth } from "@/lib/auth";
import { inngest } from "@/inngest/client";

/**
 * Trigger on-demand regeneration of today's daily briefing.
 * Admin/owner only — role enforced here (not just RLS) for a clear error message.
 */
export async function regenerateBriefing(): Promise<void> {
  const session = await requireAuth();

  if (session.orgRole !== "owner" && session.orgRole !== "admin") {
    throw new Error("Only admins and owners can regenerate the daily briefing.");
  }

  try {
    await inngest.send({
      name: "ats/analytics.briefing-requested",
      data: {
        orgId: session.orgId,
        triggeredBy: session.userId,
        force: true, // bypass cache check — admin explicitly requested fresh
      },
    });

    revalidatePath("/dashboard");
  } catch (err) {
    Sentry.captureException(err);
    throw new Error("Failed to trigger briefing regeneration. Please try again.");
  }
}
