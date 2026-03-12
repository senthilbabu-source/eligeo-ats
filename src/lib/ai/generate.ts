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
