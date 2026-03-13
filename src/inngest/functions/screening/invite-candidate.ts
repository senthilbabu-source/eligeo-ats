import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { createScreeningToken } from "@/lib/utils/candidate-token";
import logger from "@/lib/utils/logger";

/**
 * screening/invite-candidate
 *
 * D32 §7.7 #1 — When a candidate enters a stage with an active screening config,
 * create a session and send invite email with magic link.
 *
 * Trigger: ats/application.stage-entered (where stage has screening config)
 */
export const screeningInviteCandidate = inngest.createFunction(
  {
    id: "screening-invite-candidate",
    name: "Screening: Invite Candidate",
    retries: 3,
    concurrency: [{ scope: "fn", key: "event.data.applicationId", limit: 1 }],
  },
  { event: "ats/application.stage-entered" },
  async ({ event, step }) => {
    const { applicationId, organizationId, stageId } = event.data as {
      applicationId: string;
      organizationId: string;
      stageId: string;
    };

    // ── Step 1: Check if this stage has an active screening config ──
    const config = await step.run("check-screening-config", async () => {
      const supabase = createServiceClient();

      // Find the job_opening_id for this application
      const { data: app } = await supabase
        .from("applications")
        .select("candidate_id, job_opening_id")
        .eq("id", applicationId)
        .eq("organization_id", organizationId)
        .single();

      if (!app) return null;

      // Check if there's an active screening config for this job
      const { data: screeningConfig } = await supabase
        .from("screening_configs")
        .select("id, questions")
        .eq("organization_id", organizationId)
        .eq("job_opening_id", app.job_opening_id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .single();

      if (!screeningConfig) return null;

      // Check the stage name contains "screening" (case-insensitive)
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("name")
        .eq("id", stageId)
        .single();

      const isScreeningStage = stage?.name?.toLowerCase().includes("screening") ?? false;
      if (!isScreeningStage) return null;

      return {
        configId: screeningConfig.id,
        candidateId: app.candidate_id,
        jobOpeningId: app.job_opening_id,
      };
    });

    if (!config) {
      logger.debug({ applicationId, stageId }, "No screening config for this stage");
      return { skipped: true };
    }

    // ── Step 2: Check for existing session (dedup) ──
    const existingSession = await step.run("check-existing-session", async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("screening_sessions")
        .select("id, status")
        .eq("application_id", applicationId)
        .eq("config_id", config.configId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .single();
      return data;
    });

    if (existingSession) {
      logger.debug({ sessionId: existingSession.id }, "Screening session already exists");
      return { skipped: true, existingSessionId: existingSession.id };
    }

    // ── Step 3: Create screening session ──
    const session = await step.run("create-session", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("screening_sessions")
        .insert({
          organization_id: organizationId,
          application_id: applicationId,
          candidate_id: config.candidateId,
          config_id: config.configId,
          status: "pending",
        })
        .select("id")
        .single();

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to create screening session: ${error.message}`);
      }
      return data;
    });

    // ── Step 4: Generate magic link and send invite email ──
    await step.run("send-invite-email", async () => {
      const supabase = createServiceClient();

      const token = createScreeningToken({
        sessionId: session.id,
        applicationId,
        candidateId: config.candidateId,
        organizationId,
      });

      // Fetch candidate email and job title
      const { data: candidate } = await supabase
        .from("candidates")
        .select("email, first_name")
        .eq("id", config.candidateId)
        .single();

      const { data: job } = await supabase
        .from("job_openings")
        .select("title, slug")
        .eq("id", config.jobOpeningId)
        .single();

      const { data: org } = await supabase
        .from("organizations")
        .select("name, slug")
        .eq("id", organizationId)
        .single();

      if (!candidate?.email) {
        logger.warn({ candidateId: config.candidateId }, "No email for screening invite");
        return;
      }

      const screeningUrl = `${process.env.NEXT_PUBLIC_APP_URL}/careers/${org?.slug ?? "portal"}/screen/${session.id}?token=${token}`;

      // Fire notification event for email delivery
      await inngest.send({
        name: "ats/notification.requested",
        data: {
          type: "screening.invite",
          organizationId,
          recipientEmail: candidate.email,
          recipientName: candidate.first_name ?? "Candidate",
          templateData: {
            jobTitle: job?.title ?? "this position",
            orgName: org?.name ?? "the company",
            screeningUrl,
          },
        },
      });
    });

    // ── Step 5: Schedule reminder (48h) ──
    await step.sendEvent("schedule-reminder", {
      name: "ats/screening.reminder-due",
      data: {
        sessionId: session.id,
        organizationId,
        candidateId: config.candidateId,
      },
      // 48-hour delay
      ts: Date.now() + 48 * 60 * 60 * 1000,
    });

    return { sessionId: session.id };
  },
);
