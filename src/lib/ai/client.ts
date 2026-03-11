import OpenAI from "openai";

/**
 * Singleton OpenAI client. Used server-side only.
 * Configured via OPENAI_API_KEY env var.
 */
let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _client;
}

/** Models used across the app */
export const AI_MODELS = {
  /** Structured output, intent parsing, generation */
  chat: "gpt-4o-mini" as const,
  /** Embedding generation (1536 dimensions) */
  embedding: "text-embedding-3-small" as const,
};
