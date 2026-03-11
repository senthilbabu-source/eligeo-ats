import { generateObject } from "ai";
import { z } from "zod";
import { chatModel, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";

/**
 * Zod schema for parsed resume data.
 * Replaces the manual JSON schema — type-safe and validated at runtime.
 */
export const parsedResumeSchema = z.object({
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  current_title: z.string().nullable(),
  current_company: z.string().nullable(),
  location: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  skills: z.array(z.string()),
  summary: z.string().nullable(),
  years_of_experience: z.number().nullable(),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      field: z.string().nullable(),
      year: z.number().nullable(),
    }),
  ),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      duration: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
});

export type ParsedResume = z.infer<typeof parsedResumeSchema>;

const RESUME_PARSE_PROMPT = `You are an expert ATS resume parser. Extract structured data from the resume text below.

Rules:
- Extract ONLY what is explicitly stated. Do not infer or fabricate.
- For skills, extract technical skills, tools, frameworks, and languages. Normalize casing (e.g., "javascript" → "JavaScript").
- For years_of_experience, calculate from the earliest work experience to the most recent. If unclear, return null.
- If a field is not present in the resume, return null (or empty array for lists).`;

/**
 * Parse resume text using AI SDK structured output.
 * Returns extracted candidate data fields with Zod validation.
 */
export async function parseResume(params: {
  resumeText: string;
  organizationId: string;
  userId?: string;
  entityId?: string;
}): Promise<{ data: ParsedResume | null; error?: string }> {
  const { resumeText, organizationId, userId, entityId } = params;
  const startTime = Date.now();

  // Check credits (resume_parse costs 2)
  const credited = await consumeAiCredits(organizationId, "resume_parse");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "resume_parse",
      entityType: "candidate",
      entityId,
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { data: null, error: "Insufficient AI credits" };
  }

  try {
    const { object, usage } = await generateObject({
      model: chatModel,
      schema: parsedResumeSchema,
      system: RESUME_PARSE_PROMPT,
      prompt: resumeText.slice(0, 15000),
    });

    const latencyMs = Date.now() - startTime;

    await logAiUsage({
      organizationId,
      userId,
      action: "resume_parse",
      entityType: "candidate",
      entityId,
      model: AI_MODELS.chat,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs,
      status: "success",
    });

    return { data: object };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Unknown error";

    await logAiUsage({
      organizationId,
      userId,
      action: "resume_parse",
      entityType: "candidate",
      entityId,
      latencyMs,
      status: "error",
      errorMessage: message,
    });

    return { data: null, error: message };
  }
}
