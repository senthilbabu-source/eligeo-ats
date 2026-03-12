import { generateText, generateObject, streamText } from "ai";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { chatModel, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";
import { CONFIG } from "@/lib/constants/config";
import type { CloneIntent } from "@/lib/types/ground-truth";

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
 * Build additional context lines for an email draft prompt from enrichment params.
 * Pure function — exported for unit testing.
 */
export function buildEmailContextLines(params: {
  matchScore?: number;
  stageName?: string;
  daysInPipeline?: number;
  rejectionReasonLabel?: string;
}): string[] {
  const lines: string[] = [];
  if (params.matchScore !== undefined) lines.push(`AI match score: ${params.matchScore}%`);
  if (params.stageName) lines.push(`Current pipeline stage: ${params.stageName}`);
  if (params.daysInPipeline !== undefined) lines.push(`Days in pipeline: ${params.daysInPipeline}`);
  if (params.rejectionReasonLabel) lines.push(`Rejection reason: ${params.rejectionReasonLabel}`);
  return lines;
}

/**
 * Generate an AI-drafted email (rejection, outreach, update).
 */
export async function generateEmailDraft(params: {
  type: "rejection" | "outreach" | "update" | "follow_up";
  candidateName: string;
  jobTitle: string;
  context?: string;
  tone?: "warm" | "professional" | "casual";
  /** AI match score (0–100) — included in prompt when present */
  matchScore?: number;
  /** Pipeline stage the candidate is currently in */
  stageName?: string;
  /** Number of days the candidate has been in the pipeline */
  daysInPipeline?: number;
  /** Human-readable rejection reason label */
  rejectionReasonLabel?: string;
  organizationId: string;
  userId?: string;
}): Promise<{ subject: string | null; body: string | null; error?: string }> {
  const {
    type,
    candidateName,
    jobTitle,
    context,
    tone = "warm",
    matchScore,
    stageName,
    daysInPipeline,
    rejectionReasonLabel,
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
        ...buildEmailContextLines({ matchScore, stageName, daysInPipeline, rejectionReasonLabel }),
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

// ── Bias Schemas ────────────────────────────────────────────

const biasCheckSchema = z.object({
  flaggedTerms: z.array(z.string()),
  suggestions: z.record(z.string(), z.string()),
});

/**
 * Analyze a job description for biased or exclusionary language.
 * Returns flagged terms and neutral replacement suggestions.
 */
export async function checkJobDescriptionBias(params: {
  text: string;
  organizationId: string;
  userId?: string;
}): Promise<{
  flaggedTerms: string[];
  suggestions: Record<string, string>;
  error?: string;
}> {
  const { text, organizationId, userId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "bias_check");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "bias_check",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { flaggedTerms: [], suggestions: {} };
  }

  try {
    const { object, usage } = await generateObject({
      model: chatModel,
      schema: biasCheckSchema,
      system:
        "You are a DEI writing expert. Analyze job descriptions for biased, exclusionary, or gendered language. Only flag genuine bias — not neutral professional terms. Be precise.",
      prompt: `Analyze this job description for biased or exclusionary language. Return flagged terms (exact words/phrases from the text) and their neutral alternatives.\n\n${text.slice(0, 2000)}`,
      maxOutputTokens: CONFIG.AI.EMAIL_DRAFT_MAX_TOKENS,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "bias_check",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return {
      flaggedTerms: object.flaggedTerms ?? [],
      suggestions: object.suggestions ?? {},
    };
  } catch (err) {
    Sentry.captureException(err);
    return {
      flaggedTerms: [],
      suggestions: {},
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Title Suggestion Schema ─────────────────────────────────

const titleSuggestionSchema = z.object({
  suggestedTitle: z.string(),
  reason: z.string(),
});

/**
 * Suggest an updated job title based on clone intent (e.g. new level, new location).
 * Returns null when no meaningful title change is warranted.
 */
export async function suggestJobTitle(params: {
  title: string;
  intent: CloneIntent;
  organizationId: string;
  userId?: string;
}): Promise<{ suggestedTitle: string | null; reason: string | null; error?: string }> {
  const { title, intent, organizationId, userId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "title_suggestion");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "title_suggestion",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { suggestedTitle: null, reason: null };
  }

  const intentDescription = buildIntentContext(intent);

  try {
    const { object, usage } = await generateObject({
      model: chatModel,
      schema: titleSuggestionSchema,
      system:
        "You are a talent acquisition expert. Suggest an updated job title that reflects the clone intent. If the original title already fits, return it unchanged.",
      prompt: `Original title: "${title}"\nClone context: ${intentDescription}\n\nSuggest an updated title and briefly explain why (1 sentence).`,
      maxOutputTokens: 100,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "title_suggestion",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return { suggestedTitle: object.suggestedTitle, reason: object.reason };
  } catch (err) {
    Sentry.captureException(err);
    return {
      suggestedTitle: null,
      reason: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Skills Delta Schema ─────────────────────────────────────

const skillsDeltaSchema = z.object({
  add: z.array(
    z.object({
      name: z.string(),
      importance: z.enum(["required", "preferred", "nice_to_have"]),
    }),
  ),
  remove: z.array(z.string()),
});

/**
 * Suggest skills to add or remove based on clone intent and existing required skills.
 */
export async function suggestSkillsDelta(params: {
  intent: CloneIntent;
  existingSkillNames: string[];
  organizationId: string;
  userId?: string;
}): Promise<{
  add: { name: string; importance: "required" | "preferred" | "nice_to_have" }[];
  remove: string[];
  error?: string;
}> {
  const { intent, existingSkillNames, organizationId, userId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "skills_delta");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "skills_delta",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { add: [], remove: [] };
  }

  const intentDescription = buildIntentContext(intent);

  try {
    const { object, usage } = await generateObject({
      model: chatModel,
      schema: skillsDeltaSchema,
      system:
        "You are a talent acquisition expert. Based on a job clone intent, suggest skills to add or remove from the requirements. Be conservative — only suggest changes that are clearly relevant to the intent.",
      prompt: [
        `Clone context: ${intentDescription}`,
        `Existing required skills: ${existingSkillNames.length > 0 ? existingSkillNames.join(", ") : "none"}`,
        "",
        "Suggest skills to add (with importance: required/preferred/nice_to_have) and exact skill names to remove from the existing list.",
      ].join("\n"),
      maxOutputTokens: CONFIG.AI.EMAIL_DRAFT_MAX_TOKENS,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "skills_delta",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return { add: object.add ?? [], remove: object.remove ?? [] };
  } catch (err) {
    Sentry.captureException(err);
    return {
      add: [],
      remove: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
