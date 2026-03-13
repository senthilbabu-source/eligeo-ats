import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { generateObject } from "ai";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { smartModel, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";
import { CONFIG } from "@/lib/constants/config";

/**
 * Minimum character threshold for text-based extraction.
 * Below this, we assume the PDF is scanned/image-based and fall back to vision.
 */
const TEXT_THRESHOLD = 200;

/**
 * Zod schema for resume extraction output.
 * D32 §4.2 — structured extraction result stored in candidates.resume_parsed.
 */
export const resumeExtractionSchema = z.object({
  full_name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  linkedin_url: z.string().optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      year: z.string().optional(),
      field: z.string().optional(),
    }),
  ),
  certifications: z.array(z.string()).optional(),
});

export type ResumeExtraction = z.infer<typeof resumeExtractionSchema>;

/**
 * Extract raw text from a PDF buffer using pdf-parse.
 * Returns extracted text or empty string on failure.
 */
export async function extractTextFromPdf(
  buffer: Buffer,
): Promise<{ text: string; pageCount: number }> {
  try {
    // pdf-parse v3: constructor takes { data: Buffer }, then call getText()
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return { text: result.text?.trim() ?? "", pageCount: result.pages?.length ?? 0 };
  } catch {
    return { text: "", pageCount: 0 };
  }
}

/**
 * Extract raw text from a DOCX buffer using mammoth.
 * Returns extracted text or empty string on failure.
 */
export async function extractTextFromDocx(
  buffer: Buffer,
): Promise<{ text: string }> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value?.trim() ?? "" };
  } catch {
    return { text: "" };
  }
}

/**
 * Determine the extraction strategy based on MIME type and text content.
 */
export function determineExtractionStrategy(
  mimeType: string,
  extractedTextLength: number,
): "text" | "vision" | "docx" | "unsupported" {
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    return "docx";
  }

  if (mimeType === "application/pdf") {
    return extractedTextLength >= TEXT_THRESHOLD ? "text" : "vision";
  }

  return "unsupported";
}

const EXTRACTION_PROMPT = `You are an expert ATS resume parser. Extract structured data from the resume below.

Rules:
- Extract ONLY what is explicitly stated. Do not infer or fabricate.
- For skills, extract technical skills, tools, frameworks, and languages. Normalize casing (e.g., "javascript" → "JavaScript").
- Return start_date/end_date as approximate strings (e.g., "2022-01", "2019-06").
- If a field is not present, omit it or return an empty array.`;

/**
 * Parse resume text into structured data via OpenAI structured output.
 * D32 §4.3 — called after text extraction succeeds.
 */
export async function parseResumeText(params: {
  text: string;
  organizationId: string;
  userId?: string;
  entityId?: string;
}): Promise<{ data: ResumeExtraction | null; error?: string }> {
  const { text, organizationId, userId, entityId } = params;
  const startTime = Date.now();

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
      model: smartModel,
      schema: resumeExtractionSchema,
      system: EXTRACTION_PROMPT,
      prompt: text.slice(0, CONFIG.AI.RESUME_TEXT_MAX),
    });

    const latencyMs = Date.now() - startTime;

    await logAiUsage({
      organizationId,
      userId,
      action: "resume_parse",
      entityType: "candidate",
      entityId,
      model: AI_MODELS.smart,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs,
      status: "success",
    });

    return { data: object };
  } catch (err) {
    Sentry.captureException(err);
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

/**
 * Full resume extraction pipeline — hybrid approach per D32 §4.1.
 *
 * 1. PDF → pdf-parse text extraction (free)
 * 2. If text ≥ 200 chars → GPT-4o structured output (2 credits)
 * 3. If text < 200 chars (scanned) → vision fallback not yet implemented (Phase 6 v1 uses text-only; vision is v1.1)
 * 4. DOCX → mammoth text extraction (free) → GPT-4o structured output (2 credits)
 */
export async function extractAndParseResume(params: {
  fileBuffer: Buffer;
  mimeType: string;
  organizationId: string;
  userId?: string;
  candidateId?: string;
}): Promise<{
  data: ResumeExtraction | null;
  rawText: string;
  strategy: "text" | "vision" | "docx" | "unsupported";
  error?: string;
}> {
  const { fileBuffer, mimeType, organizationId, userId, candidateId } = params;

  // Step 1: Extract raw text based on file type
  let rawText = "";
  let strategy: "text" | "vision" | "docx" | "unsupported";

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    const docxResult = await extractTextFromDocx(fileBuffer);
    rawText = docxResult.text;
    strategy = "docx";
  } else if (mimeType === "application/pdf") {
    const pdfResult = await extractTextFromPdf(fileBuffer);
    rawText = pdfResult.text;
    strategy = determineExtractionStrategy(mimeType, rawText.length);
  } else {
    return { data: null, rawText: "", strategy: "unsupported", error: `Unsupported MIME type: ${mimeType}` };
  }

  // Step 2: If no usable text, return error (vision fallback is Phase 6 v1.1)
  if (rawText.length < TEXT_THRESHOLD && strategy === "vision") {
    return {
      data: null,
      rawText,
      strategy: "vision",
      error: "Scanned PDF detected — vision extraction not yet available. Resume stored without parsing.",
    };
  }

  if (!rawText) {
    return { data: null, rawText: "", strategy, error: "No text could be extracted from file" };
  }

  // Step 3: Parse extracted text via AI
  const parseResult = await parseResumeText({
    text: rawText,
    organizationId,
    userId,
    entityId: candidateId,
  });

  return {
    data: parseResult.data,
    rawText,
    strategy,
    error: parseResult.error,
  };
}
