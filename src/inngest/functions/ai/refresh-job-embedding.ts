import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import {
  generateAndStoreEmbedding,
  buildJobEmbeddingText,
} from "@/lib/ai/embeddings";
import logger from "@/lib/utils/logger";

/**
 * H-04: analytics/refresh-job-embedding
 *
 * Re-generates a job opening's embedding when its skills or description change.
 * Triggered by `ats/analytics.job-skills-changed` event, fired when
 * job_required_skills rows are modified or JD is updated.
 *
 * Concurrency limited to 1 per job to prevent duplicate embedding calls
 * on rapid skill edits.
 */
export const refreshJobEmbedding = inngest.createFunction(
  {
    id: "analytics-refresh-job-embedding",
    retries: 3,
    concurrency: [{ scope: "fn", key: "event.data.jobId", limit: 1 }],
  },
  { event: "ats/analytics.job-skills-changed" },
  async ({ event }) => {
    const { jobId, organizationId } = event.data;

    const supabase = createServiceClient();

    // Fetch job + required skills
    const { data: job, error: fetchError } = await supabase
      .from("job_openings")
      .select("id, organization_id, title, description")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !job) {
      logger.warn(
        { jobId, organizationId },
        "Job not found for embedding refresh",
      );
      return { skipped: true, reason: "job_not_found" };
    }

    // Fetch required skills
    const { data: skillRows } = await supabase
      .from("job_required_skills")
      .select("skill_name")
      .eq("job_id", jobId)
      .is("deleted_at", null);

    const requiredSkills = (skillRows ?? []).map((s) => s.skill_name);

    const text = buildJobEmbeddingText({
      title: job.title,
      description: job.description,
      required_skills: requiredSkills,
    });

    if (!text) {
      logger.info(
        { jobId },
        "No embeddable content for job — skipping refresh",
      );
      return { skipped: true, reason: "no_content" };
    }

    const result = await generateAndStoreEmbedding({
      organizationId,
      entityType: "job_opening",
      entityId: jobId,
      text,
    });

    if (!result.success) {
      Sentry.captureMessage(
        `Job embedding refresh failed: ${result.error}`,
        { extra: { jobId, organizationId } },
      );
      throw new Error(result.error ?? "Embedding refresh failed");
    }

    // Update embedding_updated_at to clear staleness signal
    await supabase
      .from("job_openings")
      .update({ embedding_updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("organization_id", organizationId);

    logger.info({ jobId }, "Job embedding refreshed after skills/JD update");
    return { success: true, jobId };
  },
);
