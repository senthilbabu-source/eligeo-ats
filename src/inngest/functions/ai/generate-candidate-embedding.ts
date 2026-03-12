import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import {
  generateAndStoreEmbedding,
  buildCandidateEmbeddingText,
} from "@/lib/ai/embeddings";
import logger from "@/lib/utils/logger";

/**
 * ai/generate-candidate-embedding
 *
 * Automatically generates an embedding for a newly created candidate.
 * Triggered by the `ats/candidate.created` event fired from createCandidate()
 * and submitPublicApplication().
 *
 * Concurrency limited to 5 per org to avoid API rate limits.
 * Retries up to 3 times on failure.
 */
export const generateCandidateEmbedding = inngest.createFunction(
  {
    id: "generate-candidate-embedding",
    retries: 3,
    concurrency: [{ scope: "fn", key: "event.data.organizationId", limit: 5 }],
  },
  { event: "ats/candidate.created" },
  async ({ event }) => {
    const { candidateId, organizationId } = event.data;

    const supabase = createServiceClient();

    const { data: candidate, error: fetchError } = await supabase
      .from("candidates")
      .select(
        "id, organization_id, resume_text, skills, current_title, current_company",
      )
      .eq("id", candidateId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !candidate) {
      logger.warn(
        { candidateId, organizationId },
        "Candidate not found for embedding generation",
      );
      return { skipped: true, reason: "candidate_not_found" };
    }

    const text = buildCandidateEmbeddingText(candidate);
    if (!text) {
      logger.info(
        { candidateId },
        "No embeddable content for candidate — skipping",
      );
      return { skipped: true, reason: "no_content" };
    }

    const result = await generateAndStoreEmbedding({
      organizationId,
      entityType: "candidate",
      entityId: candidateId,
      text,
    });

    if (!result.success) {
      Sentry.captureMessage(
        `Candidate embedding generation failed: ${result.error}`,
        { extra: { candidateId, organizationId } },
      );
      throw new Error(result.error ?? "Embedding generation failed");
    }

    logger.info({ candidateId }, "Candidate embedding generated successfully");
    return { success: true, candidateId };
  },
);
