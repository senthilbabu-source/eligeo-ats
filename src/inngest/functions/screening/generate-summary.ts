import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { generateScreeningSummary } from "@/lib/ai/screening";
import type { ScreeningQuestion, ScreeningTurn } from "@/lib/types/ground-truth";
import logger from "@/lib/utils/logger";

/**
 * screening/generate-summary
 *
 * D32 §7.7 #3 — After all questions answered, generate AI summary + score.
 *
 * Trigger: ats/screening.all-answered
 * Credits: 5 (screening_summary)
 */
export const screeningGenerateSummary = inngest.createFunction(
  {
    id: "screening-generate-summary",
    name: "Screening: Generate Summary",
    retries: 3,
    concurrency: [{ scope: "fn", key: "event.data.organizationId", limit: 3 }],
  },
  { event: "ats/screening.all-answered" },
  async ({ event, step }) => {
    const { sessionId, organizationId } = event.data as {
      sessionId: string;
      organizationId: string;
    };

    // ── Step 1: Load session + config ──
    const sessionData = await step.run("load-session", async () => {
      const supabase = createServiceClient();

      const { data: session } = await supabase
        .from("screening_sessions")
        .select("*, screening_configs!inner(questions, job_opening_id)")
        .eq("id", sessionId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .single();

      if (!session) throw new Error(`Session ${sessionId} not found`);

      const config = session.screening_configs as unknown as {
        questions: ScreeningQuestion[];
        job_opening_id: string;
      };

      // Get job title
      const { data: job } = await supabase
        .from("job_openings")
        .select("title")
        .eq("id", config.job_opening_id)
        .single();

      return {
        turns: session.turns as ScreeningTurn[],
        questions: config.questions,
        jobTitle: job?.title ?? "Unknown",
        jobOpeningId: config.job_opening_id,
      };
    });

    // ── Step 2: Generate AI summary ──
    const summary = await step.run("generate-summary", async () => {
      return generateScreeningSummary({
        turns: sessionData.turns,
        questions: sessionData.questions,
        jobTitle: sessionData.jobTitle,
        organizationId,
      });
    });

    if (summary.error) {
      logger.error({ sessionId, error: summary.error }, "Screening summary generation failed");
      Sentry.captureMessage(`Screening summary failed: ${summary.error}`, "error");
    }

    // ── Step 3: Update session ──
    await step.run("update-session", async () => {
      const supabase = createServiceClient();
      const now = new Date().toISOString();

      await supabase
        .from("screening_sessions")
        .update({
          status: "completed",
          ai_summary: summary.summary || null,
          ai_score: summary.overallScore || null,
          score_breakdown: summary.scoreBreakdown || null,
          completed_at: now,
          updated_at: now,
        })
        .eq("id", sessionId)
        .eq("organization_id", organizationId);
    });

    // ── Step 4: Notify recruiter ──
    await step.run("notify-recruiter", async () => {
      await inngest.send({
        name: "ats/notification.requested",
        data: {
          type: "screening.completed",
          organizationId,
          metadata: {
            sessionId,
            jobTitle: sessionData.jobTitle,
            score: summary.overallScore,
          },
        },
      });
    });

    return {
      sessionId,
      score: summary.overallScore,
      signalCount: summary.keySignals.length,
    };
  },
);
