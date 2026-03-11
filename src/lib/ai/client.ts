import { createOpenAI } from "@ai-sdk/openai";

/**
 * AI SDK OpenAI provider. Used server-side only.
 * Configured via OPENAI_API_KEY env var.
 */
const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Tiered model strategy:
 * - fast: low-latency tasks (intent parsing, email drafts, simple generation)
 * - smart: accuracy-critical tasks (resume parsing, fit scoring, interview summarization)
 */
export const chatModel = openaiProvider("gpt-4o-mini");
export const smartModel = openaiProvider("gpt-4o");

/** Embedding generation (1536 dimensions) */
export const embeddingModel = openaiProvider.embedding(
  "text-embedding-3-small",
);

/** Model ID strings for logging */
export const AI_MODELS = {
  fast: "gpt-4o-mini" as const,
  smart: "gpt-4o" as const,
  /** @deprecated Use AI_MODELS.fast instead */
  chat: "gpt-4o-mini" as const,
  embedding: "text-embedding-3-small" as const,
};
