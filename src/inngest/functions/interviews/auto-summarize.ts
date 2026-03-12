import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import {
  computeScorecardSummary,
  type RawSubmission,
  type RawRating,
  type RawAttribute,
  type RawCategory,
} from "@/lib/scoring";
import { summarizeScorecards } from "@/lib/ai/generate";
import logger from "@/lib/utils/logger";

/**
 * H3-3: interviews/auto-summarize
 *
 * Triggered by `ats/scorecard.submitted` event.
 * Checks if all expected scorecards for the interview's application are in.
 * If yes, generates an AI summary and notifies the hiring manager.
 *
 * Concurrency limited to 3 per org to avoid OpenAI rate limits.
 */
export const interviewAutoSummarize = inngest.createFunction(
  {
    id: "interviews-auto-summarize",
    name: "Interviews: Auto-Summarize Scorecards",
    retries: 2,
    concurrency: [{ scope: "fn", key: "event.data.organizationId", limit: 3 }],
  },
  { event: "ats/scorecard.submitted" },
  async ({ event, step }) => {
    const { applicationId, organizationId, interviewId } = event.data;

    const supabase = createServiceClient();

    // Step 1: Check if all interviews for this application have scorecards
    const completionCheck = await step.run("check-completion", async () => {
      // Get all non-cancelled interviews for this application
      const { data: interviews } = await supabase
        .from("interviews")
        .select("id")
        .eq("application_id", applicationId)
        .eq("organization_id", organizationId)
        .not("status", "in", '("cancelled","no_show")')
        .is("deleted_at", null);

      if (!interviews || interviews.length === 0) {
        return { complete: false, reason: "no_interviews" };
      }

      const interviewIds = interviews.map((i) => i.id);

      // Check which interviews have at least one scorecard submission
      const { data: submissions } = await supabase
        .from("scorecard_submissions")
        .select("interview_id")
        .in("interview_id", interviewIds)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);

      const interviewsWithScorecard = new Set(
        (submissions ?? []).map((s) => s.interview_id),
      );

      const allComplete = interviewIds.every((id) =>
        interviewsWithScorecard.has(id),
      );

      return {
        complete: allComplete,
        total: interviewIds.length,
        withScorecard: interviewsWithScorecard.size,
      };
    });

    if (!completionCheck.complete) {
      logger.info(
        {
          applicationId,
          interviewId,
          ...completionCheck,
        },
        "Not all interviews have scorecards — skipping auto-summarize",
      );
      return { skipped: true, reason: "incomplete", ...completionCheck };
    }

    // Step 2: Generate AI summary
    const summaryResult = await step.run("generate-summary", async () => {
      // Fetch all submissions for this application
      const { data: submissions } = await supabase
        .from("scorecard_submissions")
        .select("id, submitted_by, overall_recommendation, overall_notes")
        .eq("application_id", applicationId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);

      if (!submissions || submissions.length === 0) {
        return { error: "no_submissions" };
      }

      // Fetch submitter names
      const submitterIds = submissions.map((s) => s.submitted_by);
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, full_name")
        .in("id", submitterIds);

      const nameMap = new Map(
        (profiles ?? []).map((p) => [p.id, p.full_name ?? "Interviewer"]),
      );

      // Fetch ratings
      const submissionIds = submissions.map((s) => s.id);
      const { data: ratings } = await supabase
        .from("scorecard_ratings")
        .select("submission_id, attribute_id, rating, notes")
        .in("submission_id", submissionIds)
        .is("deleted_at", null);

      // Fetch attributes + categories
      const attrIds = [
        ...new Set((ratings ?? []).map((r) => r.attribute_id)),
      ];

      const { data: attributes } = await supabase
        .from("scorecard_attributes")
        .select("id, name, category_id")
        .in("id", attrIds);

      const catIds = [
        ...new Set((attributes ?? []).map((a) => a.category_id)),
      ];

      const { data: categories } = await supabase
        .from("scorecard_categories")
        .select("id, name, weight")
        .in("id", catIds);

      // Compute summary
      const rawSubmissions: RawSubmission[] = submissions.map((s) => ({
        id: s.id,
        submitted_by: s.submitted_by,
        submitter_name: nameMap.get(s.submitted_by) ?? "Interviewer",
        overall_recommendation:
          s.overall_recommendation as RawSubmission["overall_recommendation"],
      }));

      const rawRatings: RawRating[] = (ratings ?? []).map((r) => ({
        submission_id: r.submission_id,
        attribute_id: r.attribute_id,
        rating: r.rating,
        notes: r.notes,
      }));

      const rawAttributes: RawAttribute[] = (attributes ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        category_id: a.category_id,
      }));

      const rawCategories: RawCategory[] = (categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        weight: c.weight,
      }));

      const computed = computeScorecardSummary(
        applicationId,
        rawSubmissions,
        rawRatings,
        rawAttributes,
        rawCategories,
      );

      const aiCategories = computed.categories.map((cat) => ({
        name: cat.category_name,
        weight: cat.weight,
        avgRating: cat.avg_rating,
        attributes: cat.attributes.map((attr) => ({
          name: attr.attribute_name,
          avgRating: attr.avg_rating,
          ratings: attr.ratings.map((r) => ({
            submitterName: r.submitter_name,
            rating: r.rating,
            notes: r.notes,
          })),
        })),
      }));

      const result = await summarizeScorecards({
        totalSubmissions: computed.total_submissions,
        recommendations: computed.recommendations,
        weightedOverall: computed.weighted_overall,
        categories: aiCategories,
        organizationId,
        applicationId,
      });

      return result;
    });

    if (summaryResult.error) {
      Sentry.captureMessage(
        `Auto scorecard summary failed: ${summaryResult.error}`,
        { extra: { applicationId, organizationId } },
      );
      throw new Error(summaryResult.error);
    }

    // Step 3: Notify hiring manager
    await step.run("notify-hiring-manager", async () => {
      // Find the hiring manager for this job
      const { data: app } = await supabase
        .from("applications")
        .select("job_opening_id")
        .eq("id", applicationId)
        .single();

      if (!app) return;

      const { data: job } = await supabase
        .from("job_openings")
        .select("hiring_manager_id, title")
        .eq("id", app.job_opening_id)
        .single();

      if (!job?.hiring_manager_id) return;

      await inngest.send({
        name: "ats/notification.requested",
        data: {
          organizationId,
          userId: job.hiring_manager_id,
          eventType: "scorecard_summary_ready",
          entityType: "application",
          entityId: applicationId,
          metadata: {
            jobTitle: job.title,
          },
        },
      });
    });

    logger.info(
      { applicationId, organizationId },
      "Auto scorecard summary generated and notification sent",
    );

    return { success: true, applicationId };
  },
);
