import { embed } from "ai";
import * as Sentry from "@sentry/nextjs";
import { embeddingModel, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";
import { createServiceClient } from "@/lib/supabase/server";
import { CONFIG } from "@/lib/constants/config";

/**
 * Build the text input for candidate embedding generation.
 * Combines resume_text + skills + title + company for semantic matching.
 */
export function buildCandidateEmbeddingText(candidate: {
  resume_text?: string | null;
  skills?: string[];
  current_title?: string | null;
  current_company?: string | null;
}): string | null {
  const parts: string[] = [];

  if (candidate.resume_text) {
    parts.push(candidate.resume_text);
  }
  if (candidate.skills?.length) {
    parts.push(`Skills: ${candidate.skills.join(", ")}`);
  }
  if (candidate.current_title) {
    parts.push(`Current role: ${candidate.current_title}`);
  }
  if (candidate.current_company) {
    parts.push(`Company: ${candidate.current_company}`);
  }

  const text = parts.join("\n\n").trim();
  return text.length > 0 ? text : null;
}

/**
 * Build the text input for job opening embedding generation.
 * Combines title + description + required skills for semantic matching.
 */
export function buildJobEmbeddingText(job: {
  title: string;
  description?: string | null;
  required_skills?: string[];
}): string {
  const parts: string[] = [job.title];

  if (job.description) {
    parts.push(job.description);
  }
  if (job.required_skills?.length) {
    parts.push(`Required skills: ${job.required_skills.join(", ")}`);
  }

  return parts.join("\n\n").trim();
}

/**
 * Generate an embedding vector via AI SDK and store it in the database.
 * Handles credit checking, API call, storage, and usage logging.
 */
export async function generateAndStoreEmbedding(params: {
  organizationId: string;
  userId?: string;
  entityType: "candidate" | "job_opening";
  entityId: string;
  text: string;
}): Promise<{ success: boolean; error?: string }> {
  const { organizationId, userId, entityType, entityId, text } = params;
  const startTime = Date.now();

  // 1. Check and consume credits
  const credited = await consumeAiCredits(organizationId, "candidate_match");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "candidate_match",
      entityType,
      entityId,
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { success: false, error: "Insufficient AI credits" };
  }

  try {
    // 2. Generate embedding via AI SDK
    const { embedding, usage } = await embed({
      model: embeddingModel,
      value: text.slice(0, CONFIG.AI.EMBEDDING_INPUT_MAX),
    });

    const latencyMs = Date.now() - startTime;

    // 3. Store embedding in database
    const supabase = createServiceClient();
    const table = entityType === "candidate" ? "candidates" : "job_openings";
    const column = entityType === "candidate" ? "candidate_embedding" : "job_embedding";

    const { error: updateError } = await supabase
      .from(table)
      .update({
        [column]: JSON.stringify(embedding),
        embedding_updated_at: new Date().toISOString(),
      })
      .eq("id", entityId)
      .eq("organization_id", organizationId);

    if (updateError) {
      throw new Error(`Failed to store embedding: ${updateError.message}`);
    }

    // 4. Log success
    await logAiUsage({
      organizationId,
      userId,
      action: "candidate_match",
      entityType,
      entityId,
      model: AI_MODELS.embedding,
      tokensInput: usage?.tokens,
      latencyMs,
      status: "success",
    });

    return { success: true };
  } catch (err) {
    Sentry.captureException(err);
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Unknown error";

    await logAiUsage({
      organizationId,
      userId,
      action: "candidate_match",
      entityType,
      entityId,
      model: AI_MODELS.embedding,
      latencyMs,
      status: "error",
      errorMessage: message,
    });

    return { success: false, error: message };
  }
}
