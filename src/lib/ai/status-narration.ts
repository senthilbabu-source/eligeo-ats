import { generateText } from "ai";
import * as Sentry from "@sentry/nextjs";
import { chatModel, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";

/**
 * D32 §5.1 — AI-narrated status messages for the candidate portal.
 *
 * Model: gpt-4o-mini (fast tier — low latency, simple generation)
 * Credit cost: 0.5 (rounded to 1 via CREDIT_WEIGHTS)
 * Plan gating: Growth+ only. Caller is responsible for checking plan tier.
 * Caching: Result should be stored in applications.metadata.status_narration
 *          + narration_generated_at. Regenerate only on stage change.
 * Max frequency: 1 narration per week per application (enforced by caller).
 */

const NARRATION_PROMPT = `You are a warm, professional recruiter assistant. Generate a 1-2 sentence status update for a job candidate.

Rules:
- Be encouraging but honest — never imply acceptance or rejection.
- Never reveal internal notes, scores, or interviewer feedback.
- Never mention specific future dates or timelines.
- Use the candidate's current stage to craft an appropriate message.
- Keep it concise: maximum 2 sentences.`;

interface NarrationParams {
  stageType: string;
  daysInStage: number;
  jobTitle: string;
  orgName: string;
  organizationId: string;
  userId?: string;
}

export async function generateCandidateStatusNarration(
  params: NarrationParams,
): Promise<{ narration: string; error?: string }> {
  const { stageType, daysInStage, jobTitle, orgName, organizationId, userId } =
    params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "status_narration");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "status_narration",
      entityType: "application",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { narration: "", error: "Insufficient AI credits" };
  }

  try {
    const { text, usage } = await generateText({
      model: chatModel,
      system: NARRATION_PROMPT,
      prompt: `Candidate stage: ${stageType}. Days in current stage: ${daysInStage}. Job title: ${jobTitle}. Company: ${orgName}.`,
    });

    const latencyMs = Date.now() - startTime;

    await logAiUsage({
      organizationId,
      userId,
      action: "status_narration",
      entityType: "application",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs,
      status: "success",
    });

    return { narration: text.trim() };
  } catch (err) {
    Sentry.captureException(err);
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Unknown error";

    await logAiUsage({
      organizationId,
      userId,
      action: "status_narration",
      entityType: "application",
      latencyMs,
      status: "error",
      errorMessage: message,
    });

    return { narration: "", error: message };
  }
}
