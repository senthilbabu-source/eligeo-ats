import { generateText, generateObject, streamText } from "ai";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { chatModel, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";
import { CONFIG } from "@/lib/constants/config";

/**
 * Generate a full job description from a title and key points.
 * Returns formatted markdown text.
 */
export async function generateJobDescription(params: {
  title: string;
  department?: string;
  keyPoints?: string;
  organizationId: string;
  userId?: string;
}): Promise<{ text: string | null; error?: string }> {
  const { title, department, keyPoints, organizationId, userId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "job_description_generate");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "job_description_generate",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { text: null, error: "Insufficient AI credits" };
  }

  try {
    const prompt = [
      `Write a professional job description for the role: ${title}`,
      department && `Department: ${department}`,
      keyPoints && `Key points to include:\n${keyPoints}`,
      "",
      "Format with sections: About the Role, Responsibilities, Requirements, Nice to Have, What We Offer.",
      "Use clear, inclusive language. Avoid jargon and gendered terms.",
      "Keep it concise — aim for 400-600 words.",
    ]
      .filter(Boolean)
      .join("\n");

    const { text, usage } = await generateText({
      model: chatModel,
      system:
        "You are a talent acquisition expert who writes compelling, inclusive job descriptions. Return plain text with section headers.",
      prompt,
      maxOutputTokens: CONFIG.AI.JOB_DESCRIPTION_MAX_TOKENS,
    });

    const latencyMs = Date.now() - startTime;

    await logAiUsage({
      organizationId,
      userId,
      action: "job_description_generate",
      entityType: "job_opening",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs,
      status: "success",
    });

    return { text };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "job_description_generate",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { text: null, error: message };
  }
}

const emailDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

/**
 * Generate an AI-drafted email (rejection, outreach, update).
 */
export async function generateEmailDraft(params: {
  type: "rejection" | "outreach" | "update" | "follow_up";
  candidateName: string;
  jobTitle: string;
  context?: string;
  tone?: "warm" | "professional" | "casual";
  organizationId: string;
  userId?: string;
}): Promise<{ subject: string | null; body: string | null; error?: string }> {
  const {
    type,
    candidateName,
    jobTitle,
    context,
    tone = "warm",
    organizationId,
    userId,
  } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "email_draft");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "email_draft",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { subject: null, body: null, error: "Insufficient AI credits" };
  }

  const typeInstructions: Record<string, string> = {
    rejection:
      "Write a kind, respectful rejection email. Acknowledge their effort. Encourage future applications if appropriate.",
    outreach:
      "Write a compelling sourcing outreach email. Personalize based on the candidate's background. Keep it short and actionable.",
    update:
      "Write a brief status update email. Be transparent about the process and timeline.",
    follow_up:
      "Write a gentle follow-up email. Reference the previous communication. Keep it brief.",
  };

  try {
    const { object, usage } = await generateObject({
      model: chatModel,
      schema: emailDraftSchema,
      system: `You are a recruiter drafting emails. Tone: ${tone}. ${typeInstructions[type] ?? ""}
Body should be plain text with line breaks, not HTML.`,
      prompt: [
        `Candidate: ${candidateName}`,
        `Role: ${jobTitle}`,
        context && `Context: ${context}`,
      ]
        .filter(Boolean)
        .join("\n"),
      maxOutputTokens: CONFIG.AI.EMAIL_DRAFT_MAX_TOKENS,
    });

    const latencyMs = Date.now() - startTime;

    await logAiUsage({
      organizationId,
      userId,
      action: "email_draft",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs,
      status: "success",
      metadata: { type, tone },
    });

    return {
      subject: object.subject ?? null,
      body: object.body ?? null,
    };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "email_draft",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { subject: null, body: null, error: message };
  }
}

/**
 * Build a context string from a clone intent for injection into AI prompts.
 * Pure function — exported for unit testing.
 */
export function buildIntentContext(intent: {
  reason: "new_location" | "new_level" | "repost" | "different_team";
  newLocation?: string;
  newLevel?: string;
}): string {
  switch (intent.reason) {
    case "new_location":
      return [
        `This is a clone for a new location${intent.newLocation ? `: ${intent.newLocation}` : ""}.`,
        "Update location-specific references in the description where relevant.",
      ].join(" ");
    case "new_level":
      return [
        `This is a clone for a different seniority level${intent.newLevel ? `: ${intent.newLevel}` : ""}.`,
        "Adjust experience requirements and responsibilities to match the new level.",
      ].join(" ");
    case "repost":
      return "This is a repost of a previously closed role. Refresh the language, update any time-sensitive references, and modernize where needed.";
    case "different_team":
      return "This is a clone for a different team or department. Adapt team-specific context and reporting structure as appropriate.";
  }
}

/**
 * Stream a job description in real-time via AI SDK.
 * Returns a streamText result for use with toDataStreamResponse().
 * Credit check and usage logging handled here.
 */
export async function streamJobDescription(params: {
  title: string;
  department?: string;
  keyPoints?: string;
  organizationId: string;
  userId?: string;
}) {
  const { title, department, keyPoints, organizationId, userId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "job_description_generate");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "job_description_generate",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return null;
  }

  const prompt = [
    `Write a professional job description for the role: ${title}`,
    department && `Department: ${department}`,
    keyPoints && `Key points to include:\n${keyPoints}`,
    "",
    "Format with sections: About the Role, Responsibilities, Requirements, Nice to Have, What We Offer.",
    "Use clear, inclusive language. Avoid jargon and gendered terms.",
    "Keep it concise — aim for 400-600 words.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = streamText({
    model: chatModel,
    system:
      "You are a talent acquisition expert who writes compelling, inclusive job descriptions. Return plain text with section headers.",
    prompt,
    maxOutputTokens: CONFIG.AI.JOB_DESCRIPTION_MAX_TOKENS,
    async onFinish({ usage }) {
      const latencyMs = Date.now() - startTime;
      await logAiUsage({
        organizationId,
        userId,
        action: "job_description_generate",
        entityType: "job_opening",
        model: AI_MODELS.fast,
        tokensInput: usage?.inputTokens,
        tokensOutput: usage?.outputTokens,
        latencyMs,
        status: "success",
      });
    },
  });

  return result;
}
