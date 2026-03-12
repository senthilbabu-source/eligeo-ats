import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import {
  generateAndStoreEmbedding,
  buildCandidateEmbeddingText,
} from "@/lib/ai/embeddings";
import logger from "@/lib/utils/logger";

/**
 * H2-1: candidates/refresh-stale-embedding
 *
 * Re-generates a candidate's embedding when their skills change.
 * Triggered by `ats/candidate.skills_updated` event, which should be
 * fired when candidate_skills rows are inserted/updated/deleted
 * (DB trigger sets skills_updated_at, app code fires this event).
 *
 * Concurrency limited to 5 per org to avoid OpenAI rate limits.
 */
export const refreshStaleEmbedding = inngest.createFunction(
  {
    id: "candidates-refresh-stale-embedding",
    retries: 3,
    concurrency: [{ scope: "fn", key: "event.data.organizationId", limit: 5 }],
  },
  { event: "ats/candidate.skills_updated" },
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
        "Candidate not found for embedding refresh",
      );
      return { skipped: true, reason: "candidate_not_found" };
    }

    const text = buildCandidateEmbeddingText(candidate);
    if (!text) {
      logger.info(
        { candidateId },
        "No embeddable content for candidate — skipping refresh",
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
        `Candidate embedding refresh failed: ${result.error}`,
        { extra: { candidateId, organizationId } },
      );
      throw new Error(result.error ?? "Embedding refresh failed");
    }

    logger.info({ candidateId }, "Candidate embedding refreshed after skills update");
    return { success: true, candidateId };
  },
);
