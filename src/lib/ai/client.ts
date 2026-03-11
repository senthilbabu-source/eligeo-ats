import { createOpenAI } from "@ai-sdk/openai";

/**
 * AI SDK OpenAI provider. Used server-side only.
 * Configured via OPENAI_API_KEY env var.
 */
const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** Structured output, intent parsing, generation */
export const chatModel = openaiProvider("gpt-4o-mini");

/** Embedding generation (1536 dimensions) */
export const embeddingModel = openaiProvider.embedding(
  "text-embedding-3-small",
);

/** Model ID strings for logging */
export const AI_MODELS = {
  chat: "gpt-4o-mini" as const,
  embedding: "text-embedding-3-small" as const,
};
