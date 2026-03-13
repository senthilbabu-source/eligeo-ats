import { generateText, generateObject, streamText } from "ai";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { chatModel, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";
import { CONFIG } from "@/lib/constants/config";
import type { CloneIntent, OfferCompensation } from "@/lib/types/ground-truth";

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

// ── Scorecard Summarization ──────────────────────────────────

/**
 * Build a structured prompt from scorecard data for AI summarization.
 * Pure function — exported for unit testing.
 */
export function buildScorecardSummaryPrompt(params: {
  totalSubmissions: number;
  recommendations: { strong_yes: number; yes: number; no: number; strong_no: number };
  weightedOverall: number | null;
  categories: Array<{
    name: string;
    weight: number;
    avgRating: number;
    attributes: Array<{
      name: string;
      avgRating: number;
      ratings: Array<{ submitterName: string; rating: number; notes?: string | null }>;
    }>;
  }>;
}): string {
  const lines: string[] = [];
  const { totalSubmissions, recommendations, weightedOverall, categories } = params;

  lines.push(`Interview feedback from ${totalSubmissions} interviewer${totalSubmissions !== 1 ? "s" : ""}.`);
  lines.push(
    `Recommendations: ${recommendations.strong_yes} strong yes, ${recommendations.yes} yes, ${recommendations.no} no, ${recommendations.strong_no} strong no.`,
  );
  if (weightedOverall !== null) {
    lines.push(`Weighted overall score: ${weightedOverall.toFixed(1)} / 5.0`);
  }
  lines.push("");

  for (const cat of categories) {
    lines.push(`## ${cat.name} (weight: ${cat.weight}, avg: ${cat.avgRating.toFixed(1)}/5)`);
    for (const attr of cat.attributes) {
      lines.push(`- ${attr.name}: avg ${attr.avgRating.toFixed(1)}/5`);
      for (const r of attr.ratings) {
        const notePart = r.notes ? ` — "${r.notes}"` : "";
        lines.push(`  ${r.submitterName}: ${r.rating}/5${notePart}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Generate an AI summary of scorecard feedback for an application.
 * D07 §5.3 — gpt-4o-mini, 3–5 sentence digest highlighting consensus,
 * disagreements, and key strengths/weaknesses.
 */
export async function summarizeScorecards(params: {
  totalSubmissions: number;
  recommendations: { strong_yes: number; yes: number; no: number; strong_no: number };
  weightedOverall: number | null;
  categories: Array<{
    name: string;
    weight: number;
    avgRating: number;
    attributes: Array<{
      name: string;
      avgRating: number;
      ratings: Array<{ submitterName: string; rating: number; notes?: string | null }>;
    }>;
  }>;
  organizationId: string;
  userId?: string;
  applicationId: string;
}): Promise<{ summary: string | null; error?: string }> {
  const { organizationId, userId, applicationId, ...scorecardData } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "feedback_summarize");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "feedback_summarize",
      entityType: "application",
      entityId: applicationId,
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { summary: null, error: "Insufficient AI credits" };
  }

  const prompt = buildScorecardSummaryPrompt(scorecardData);

  try {
    const { text, usage } = await generateText({
      model: chatModel,
      system:
        "You are a talent acquisition analyst. Summarize interview scorecard feedback in 3–5 concise sentences. " +
        "Highlight areas of consensus and disagreement among interviewers. " +
        "Call out key strengths and weaknesses. " +
        "Do not include candidate names or interviewer names. Be objective and actionable.",
      prompt,
      maxOutputTokens: 300,
    });

    const latencyMs = Date.now() - startTime;

    await logAiUsage({
      organizationId,
      userId,
      action: "feedback_summarize",
      entityType: "application",
      entityId: applicationId,
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs,
      status: "success",
    });

    return { summary: text };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "feedback_summarize",
      entityType: "application",
      entityId: applicationId,
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { summary: null, error: message };
  }
}

// ── Offer Compensation Suggestion ────────────────────────────

const compensationSuggestionSchema = z.object({
  base_salary: z.number(),
  currency: z.string(),
  period: z.enum(["annual", "monthly", "hourly"]),
  bonus_pct: z.number().optional(),
  equity_shares: z.number().optional(),
  equity_type: z.enum(["options", "rsu", "phantom"]).optional(),
  sign_on_bonus: z.number().optional(),
  reasoning: z.string(),
});

/**
 * Build context lines for an offer compensation suggestion prompt.
 * Pure function — exported for unit testing.
 */
export function buildOfferCompContext(params: {
  jobTitle: string;
  department?: string;
  level?: string;
  location?: string;
  candidateCurrentComp?: Partial<OfferCompensation>;
  orgDefaultCurrency?: string;
}): string[] {
  const lines: string[] = [];
  lines.push(`Job title: ${params.jobTitle}`);
  if (params.department) lines.push(`Department: ${params.department}`);
  if (params.level) lines.push(`Level: ${params.level}`);
  if (params.location) lines.push(`Location: ${params.location}`);
  if (params.orgDefaultCurrency) lines.push(`Organization currency: ${params.orgDefaultCurrency}`);
  if (params.candidateCurrentComp?.base_salary) {
    lines.push(`Candidate's current compensation: ${params.candidateCurrentComp.currency ?? "USD"} ${params.candidateCurrentComp.base_salary} ${params.candidateCurrentComp.period ?? "annual"}`);
  }
  return lines;
}

/**
 * Suggest competitive compensation for an offer based on role, level, and location.
 * Uses gpt-4o-mini for structured output.
 */
export async function suggestOfferCompensation(params: {
  jobTitle: string;
  department?: string;
  level?: string;
  location?: string;
  candidateCurrentComp?: Partial<OfferCompensation>;
  orgDefaultCurrency?: string;
  organizationId: string;
  userId?: string;
}): Promise<{
  suggestion: z.infer<typeof compensationSuggestionSchema> | null;
  error?: string;
}> {
  const { organizationId, userId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "offer_compensation_suggest");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "offer_compensation_suggest",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { suggestion: null, error: "Insufficient AI credits" };
  }

  const contextLines = buildOfferCompContext(params);

  try {
    const { object, usage } = await generateObject({
      model: chatModel,
      schema: compensationSuggestionSchema,
      system:
        "You are a compensation analyst for a staffing and consulting company. " +
        "Suggest competitive compensation based on market data for the role, level, and location. " +
        "Be realistic — base suggestions on typical US tech industry ranges unless a specific location is given. " +
        "Include a brief reasoning (1-2 sentences) explaining the suggestion.",
      prompt: contextLines.join("\n"),
      maxOutputTokens: CONFIG.AI.OFFER_COMP_MAX_TOKENS,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "offer_compensation_suggest",
      entityType: "offer",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return { suggestion: object };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "offer_compensation_suggest",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { suggestion: null, error: message };
  }
}

// ── Offer Letter Draft ───────────────────────────────────────

/**
 * Generate an offer letter draft from compensation data and template terms.
 * Returns formatted text suitable for an offer letter PDF.
 */
export async function generateOfferLetterDraft(params: {
  candidateName: string;
  jobTitle: string;
  department?: string;
  compensation: OfferCompensation;
  startDate?: string;
  termsTemplate?: string;
  organizationName: string;
  organizationId: string;
  userId?: string;
}): Promise<{ text: string | null; error?: string }> {
  const {
    candidateName,
    jobTitle,
    department,
    compensation,
    startDate,
    termsTemplate,
    organizationName,
    organizationId,
    userId,
  } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "offer_letter_draft");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "offer_letter_draft",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { text: null, error: "Insufficient AI credits" };
  }

  const compLines = [
    `Base salary: ${compensation.currency} ${compensation.base_salary.toLocaleString()} ${compensation.period}`,
    compensation.bonus_pct ? `Bonus: ${compensation.bonus_pct}% target` : null,
    compensation.bonus_amount ? `Bonus amount: ${compensation.currency} ${compensation.bonus_amount.toLocaleString()}` : null,
    compensation.equity_shares ? `Equity: ${compensation.equity_shares} ${compensation.equity_type ?? "shares"}${compensation.equity_vesting ? ` (${compensation.equity_vesting})` : ""}` : null,
    compensation.sign_on_bonus ? `Sign-on bonus: ${compensation.currency} ${compensation.sign_on_bonus.toLocaleString()}` : null,
    compensation.relocation ? `Relocation: ${compensation.currency} ${compensation.relocation.toLocaleString()}` : null,
    compensation.other_benefits?.length ? `Benefits: ${compensation.other_benefits.join(", ")}` : null,
  ].filter(Boolean);

  const prompt = [
    `Write a professional offer letter for ${candidateName} for the ${jobTitle} role at ${organizationName}.`,
    department && `Department: ${department}`,
    startDate && `Start date: ${startDate}`,
    "",
    "Compensation:",
    ...compLines,
    "",
    termsTemplate && `Additional terms/template to incorporate:\n${termsTemplate}`,
    "",
    "Format as a formal offer letter with: greeting, congratulations, role details, compensation breakdown, next steps, and closing.",
    "Keep it professional, warm, and concise (300-500 words).",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { text, usage } = await generateText({
      model: chatModel,
      system:
        "You are an HR professional drafting employment offer letters. " +
        "Write clear, professional offer letters that are legally sound and welcoming. " +
        "Do not include fields you don't have data for — only include compensation components that are provided.",
      prompt,
      maxOutputTokens: CONFIG.AI.OFFER_LETTER_MAX_TOKENS,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "offer_letter_draft",
      entityType: "offer",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return { text };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "offer_letter_draft",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { text: null, error: message };
  }
}

// ── Salary Band Check ────────────────────────────────────────

const salaryCheckSchema = z.object({
  withinBand: z.boolean(),
  percentile: z.number().min(0).max(100),
  assessment: z.enum(["below_market", "competitive", "above_market"]),
  reasoning: z.string(),
});

/**
 * Check if proposed compensation is within market salary bands for the role.
 * Returns band assessment and percentile estimate.
 */
export async function checkSalaryBand(params: {
  jobTitle: string;
  level?: string;
  location?: string;
  proposedBaseSalary: number;
  currency: string;
  period: string;
  organizationId: string;
  userId?: string;
}): Promise<{
  result: z.infer<typeof salaryCheckSchema> | null;
  error?: string;
}> {
  const { jobTitle, level, location, proposedBaseSalary, currency, period, organizationId, userId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "offer_salary_check");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "offer_salary_check",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { result: null, error: "Insufficient AI credits" };
  }

  const prompt = [
    `Evaluate if this compensation is competitive for the role:`,
    `Role: ${jobTitle}`,
    level && `Level: ${level}`,
    location && `Location: ${location}`,
    `Proposed base salary: ${currency} ${proposedBaseSalary.toLocaleString()} ${period}`,
    "",
    "Assess whether the proposed salary is below market, competitive, or above market.",
    "Estimate what percentile this falls in (0-100, where 50 is median).",
    "Base your assessment on typical US tech industry ranges unless a specific location is given.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { object, usage } = await generateObject({
      model: chatModel,
      schema: salaryCheckSchema,
      system:
        "You are a compensation analyst. Evaluate proposed salaries against market data. " +
        "Be realistic and specific. Use US tech market data as baseline unless location-specific data applies.",
      prompt,
      maxOutputTokens: CONFIG.AI.OFFER_COMP_MAX_TOKENS,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "offer_salary_check",
      entityType: "offer",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return { result: object };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "offer_salary_check",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { result: null, error: message };
  }
}

// ── H3-2: Match Explanation ──────────────────────────────

const matchExplanationSchema = z.object({
  explanation: z.string().describe("2-3 sentence explanation of why this candidate matches or doesn't match the role"),
  keyMatches: z.array(z.string()).describe("Top skills/qualifications that align with the job"),
  keyGaps: z.array(z.string()).describe("Notable missing requirements or experience gaps"),
});

/**
 * H3-2: Generate an AI explanation for why a candidate matched a job.
 * Uses gpt-4o-mini for speed — runs per candidate in the match list.
 */
export async function generateMatchExplanation(params: {
  candidateName: string;
  candidateSkills: string[];
  candidateTitle?: string | null;
  jobTitle: string;
  requiredSkills: string[];
  similarityScore: number;
  organizationId: string;
  userId?: string;
}): Promise<{
  explanation: string | null;
  keyMatches: string[];
  keyGaps: string[];
  error?: string;
}> {
  const {
    candidateName,
    candidateSkills,
    candidateTitle,
    jobTitle,
    requiredSkills,
    similarityScore,
    organizationId,
    userId,
  } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "match_explanation");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "match_explanation",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { explanation: null, keyMatches: [], keyGaps: [], error: "Insufficient AI credits" };
  }

  try {
    const prompt = [
      `Analyze why candidate "${candidateName}" ${candidateTitle ? `(${candidateTitle})` : ""} is a match for the "${jobTitle}" role.`,
      `Similarity score: ${(similarityScore * 100).toFixed(0)}%`,
      `Candidate skills: ${candidateSkills.length > 0 ? candidateSkills.join(", ") : "None listed"}`,
      `Required skills: ${requiredSkills.length > 0 ? requiredSkills.join(", ") : "None specified"}`,
      "",
      "Provide a concise explanation (2-3 sentences), list key matching qualifications, and note any gaps.",
      "Be specific about which skills match and which are missing. Do not speculate beyond the data given.",
    ].join("\n");

    const { object, usage } = await generateObject({
      model: chatModel,
      schema: matchExplanationSchema,
      system: "You are a recruitment analyst. Provide factual, concise match explanations based on skills and role requirements. Never fabricate skills the candidate doesn't have.",
      prompt,
      maxOutputTokens: 500,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "match_explanation",
      entityType: "candidate",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return {
      explanation: object.explanation,
      keyMatches: object.keyMatches,
      keyGaps: object.keyGaps,
    };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "match_explanation",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { explanation: null, keyMatches: [], keyGaps: [], error: message };
  }
}

// ── P6-2b: Merge Confidence Scoring ──────────────────────

const mergeConfidenceSchema = z.object({
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  signals: z.array(z.string()),
});

const MERGE_PROMPT = `You are a duplicate detection expert for an ATS (Applicant Tracking System).
Compare two candidate records and assess the likelihood they are the same person.

Rules:
- Return a confidence score from 0.00 (definitely different people) to 1.00 (definitely same person).
- List specific signals that support your conclusion (e.g., "Matching phone number", "Same LinkedIn URL", "Similar name spelling").
- Consider: exact matches on phone/email/LinkedIn are very strong signals. Name similarity alone is weak.
- If key identifiers differ (different emails AND different phones AND different LinkedIn), confidence should be low.
- Be conservative — false merges are worse than missed duplicates.`;

/**
 * D32 §5.5 — AI merge confidence scoring for candidate deduplication.
 * Model: gpt-4o-mini. Credit cost: 1 (merge_score).
 * Plan gating: Growth+ only (caller responsible for checking).
 */
export async function scoreMergeCandidates(params: {
  candidateA: {
    full_name: string;
    email?: string;
    phone?: string;
    linkedin_url?: string;
    skills?: string[];
    current_company?: string;
  };
  candidateB: {
    full_name: string;
    email?: string;
    phone?: string;
    linkedin_url?: string;
    skills?: string[];
    current_company?: string;
  };
  organizationId: string;
  userId?: string;
}): Promise<{
  confidence: number;
  reasoning: string;
  signals: string[];
  error?: string;
}> {
  const { candidateA, candidateB, organizationId, userId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "merge_score");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "merge_score",
      entityType: "candidate",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return {
      confidence: 0,
      reasoning: "",
      signals: [],
      error: "Insufficient AI credits",
    };
  }

  try {
    const prompt = [
      "Candidate A:",
      `  Name: ${candidateA.full_name}`,
      candidateA.email ? `  Email: ${candidateA.email}` : null,
      candidateA.phone ? `  Phone: ${candidateA.phone}` : null,
      candidateA.linkedin_url ? `  LinkedIn: ${candidateA.linkedin_url}` : null,
      candidateA.current_company ? `  Company: ${candidateA.current_company}` : null,
      candidateA.skills?.length ? `  Skills: ${candidateA.skills.join(", ")}` : null,
      "",
      "Candidate B:",
      `  Name: ${candidateB.full_name}`,
      candidateB.email ? `  Email: ${candidateB.email}` : null,
      candidateB.phone ? `  Phone: ${candidateB.phone}` : null,
      candidateB.linkedin_url ? `  LinkedIn: ${candidateB.linkedin_url}` : null,
      candidateB.current_company ? `  Company: ${candidateB.current_company}` : null,
      candidateB.skills?.length ? `  Skills: ${candidateB.skills.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const { object, usage } = await generateObject({
      model: chatModel,
      schema: mergeConfidenceSchema,
      system: MERGE_PROMPT,
      prompt,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "merge_score",
      entityType: "candidate",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return {
      confidence: object.confidence,
      reasoning: object.reasoning,
      signals: object.signals,
    };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "merge_score",
      entityType: "candidate",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { confidence: 0, reasoning: "", signals: [], error: message };
  }
}

// ── Phase 7 Wave A1: Analytics Narrative ──────────────────────

const analyticsNarrativeSchema = z.object({
  headline: z.string().describe("One sentence: the most important insight"),
  narrative: z.string().describe("2-3 sentences: what the data shows and why it matters"),
  topAction: z.string().describe("One specific recommended action"),
  anomalies: z.array(z.string()).describe("0-3 flagged anomalies (statistically unusual patterns)"),
});

/**
 * Generate an AI narrative for an analytics view.
 * Model: gpt-4o-mini (narrative task, not complex reasoning).
 * D33 §5 — every analytics view answers "so what?" automatically (ADR-011).
 */
export async function generateAnalyticsNarrative(params: {
  view: "funnel" | "velocity" | "source" | "team" | "jobs";
  currentPeriod: object;
  previousPeriod: object | null;
  orgContext: {
    totalOpenJobs: number;
    teamSize: number;
    avgTimeToHire: number;
  };
  organizationId: string;
  userId?: string;
}): Promise<{
  headline: string | null;
  narrative: string | null;
  topAction: string | null;
  anomalies: string[];
  error?: string;
}> {
  const { view, currentPeriod, previousPeriod, orgContext, organizationId, userId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "analytics_narrative");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "analytics_narrative",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { headline: null, narrative: null, topAction: null, anomalies: [], error: "Insufficient AI credits" };
  }

  const prompt = [
    `Analyze this ${view} analytics data for a recruiting team.`,
    "",
    "Current period data:",
    JSON.stringify(currentPeriod, null, 2).slice(0, 2000),
    "",
    previousPeriod ? `Previous period data (for comparison):\n${JSON.stringify(previousPeriod, null, 2).slice(0, 2000)}` : "No previous period data available.",
    "",
    `Org context: ${orgContext.totalOpenJobs} open jobs, ${orgContext.teamSize} team members, avg time-to-hire: ${orgContext.avgTimeToHire} days.`,
    "",
    "Flag any anomalies where a metric changed by >20% compared to the previous period.",
  ].join("\n");

  try {
    const { object, usage } = await generateObject({
      model: chatModel,
      schema: analyticsNarrativeSchema,
      system:
        "You are a recruiting analytics expert. Analyze hiring data and provide clear, actionable insights. " +
        "Focus on what changed and what the recruiter should do. Be specific, not generic. " +
        "Avoid hollow phrases like 'it is important to...' or 'you should consider...'. Give direct recommendations.",
      prompt,
      maxOutputTokens: 500,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "analytics_narrative",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
      metadata: { view },
    });

    return {
      headline: object.headline,
      narrative: object.narrative,
      topAction: object.topAction,
      anomalies: object.anomalies ?? [],
    };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "analytics_narrative",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { headline: null, narrative: null, topAction: null, anomalies: [], error: message };
  }
}

const pipelineHealthNarrativeSchema = z.object({
  summary: z.string().describe("One sentence health assessment"),
  primaryRisk: z.string().nullable().describe("Main risk factor, or null if healthy"),
  recommendation: z.string().describe("One specific action to improve pipeline health"),
});

/**
 * Generate an AI health narrative for a specific job's pipeline.
 * D33 §5 — per-job health assessment.
 */
export async function generatePipelineHealthNarrative(params: {
  jobTitle: string;
  healthScore: number;
  daysOpen: number;
  applicationCount: number;
  bottleneckStage: string | null;
  predictedFillDays: number | null;
  organizationId: string;
  userId?: string;
}): Promise<{
  summary: string | null;
  primaryRisk: string | null;
  recommendation: string | null;
  error?: string;
}> {
  const {
    jobTitle, healthScore, daysOpen, applicationCount,
    bottleneckStage, predictedFillDays, organizationId, userId,
  } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "analytics_narrative");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "analytics_narrative",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { summary: null, primaryRisk: null, recommendation: null, error: "Insufficient AI credits" };
  }

  const prompt = [
    `Assess the pipeline health for the "${jobTitle}" role.`,
    `Health score: ${(healthScore * 100).toFixed(0)}%`,
    `Days open: ${daysOpen}`,
    `Total applications: ${applicationCount}`,
    bottleneckStage ? `Bottleneck stage: ${bottleneckStage}` : "No bottleneck detected.",
    predictedFillDays !== null ? `Predicted fill: ${predictedFillDays} days` : "Fill prediction unavailable.",
  ].join("\n");

  try {
    const { object, usage } = await generateObject({
      model: chatModel,
      schema: pipelineHealthNarrativeSchema,
      system:
        "You are a recruiting analytics expert. Provide a brief, direct health assessment for a job pipeline. " +
        "If the health score is below 50%, identify the primary risk. Always give one specific recommendation.",
      prompt,
      maxOutputTokens: 300,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "analytics_narrative",
      entityType: "job_opening",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return {
      summary: object.summary,
      primaryRisk: object.primaryRisk,
      recommendation: object.recommendation,
    };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "analytics_narrative",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { summary: null, primaryRisk: null, recommendation: null, error: message };
  }
}
