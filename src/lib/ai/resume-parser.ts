import { getOpenAIClient, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";

/**
 * Parsed resume data extracted by OpenAI structured output.
 */
export interface ParsedResume {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  linkedin_url: string | null;
  skills: string[];
  summary: string | null;
  years_of_experience: number | null;
  education: Array<{
    institution: string;
    degree: string;
    field: string | null;
    year: number | null;
  }>;
  experience: Array<{
    company: string;
    title: string;
    duration: string | null;
    description: string | null;
  }>;
}

const RESUME_PARSE_PROMPT = `You are an expert ATS resume parser. Extract structured data from the resume text below.

Rules:
- Extract ONLY what is explicitly stated. Do not infer or fabricate.
- For skills, extract technical skills, tools, frameworks, and languages. Normalize casing (e.g., "javascript" → "JavaScript").
- For years_of_experience, calculate from the earliest work experience to the most recent. If unclear, return null.
- If a field is not present in the resume, return null (or empty array for lists).
- Return valid JSON matching the schema exactly.`;

/**
 * Parse resume text using OpenAI structured output.
 * Returns extracted candidate data fields.
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
    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
      model: AI_MODELS.chat,
      messages: [
        { role: "system", content: RESUME_PARSE_PROMPT },
        { role: "user", content: resumeText.slice(0, 15000) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "parsed_resume",
          strict: true,
          schema: {
            type: "object",
            properties: {
              full_name: { type: ["string", "null"] },
              email: { type: ["string", "null"] },
              phone: { type: ["string", "null"] },
              current_title: { type: ["string", "null"] },
              current_company: { type: ["string", "null"] },
              location: { type: ["string", "null"] },
              linkedin_url: { type: ["string", "null"] },
              skills: { type: "array", items: { type: "string" } },
              summary: { type: ["string", "null"] },
              years_of_experience: { type: ["number", "null"] },
              education: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    institution: { type: "string" },
                    degree: { type: "string" },
                    field: { type: ["string", "null"] },
                    year: { type: ["number", "null"] },
                  },
                  required: ["institution", "degree", "field", "year"],
                  additionalProperties: false,
                },
              },
              experience: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    company: { type: "string" },
                    title: { type: "string" },
                    duration: { type: ["string", "null"] },
                    description: { type: ["string", "null"] },
                  },
                  required: ["company", "title", "duration", "description"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "full_name", "email", "phone", "current_title", "current_company",
              "location", "linkedin_url", "skills", "summary",
              "years_of_experience", "education", "experience",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed: ParsedResume = JSON.parse(content);

    await logAiUsage({
      organizationId,
      userId,
      action: "resume_parse",
      entityType: "candidate",
      entityId,
      model: AI_MODELS.chat,
      tokensInput: response.usage?.prompt_tokens,
      tokensOutput: response.usage?.completion_tokens,
      latencyMs,
      status: "success",
    });

    return { data: parsed };
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
