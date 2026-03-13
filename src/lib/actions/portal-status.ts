"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyStatusToken } from "@/lib/utils/candidate-token";
import { generateCandidateStatusNarration } from "@/lib/ai/status-narration";
import { isValidPlan, type PlanTier } from "@/lib/billing/plans";
import logger from "@/lib/utils/logger";

/**
 * D32 §5.1 — Fetch application status data for the candidate portal.
 * Public action — no auth required. Token-based access only.
 */
export async function getApplicationStatus(token: string) {
  const result = verifyStatusToken(token);
  if (!result.valid) {
    return { error: result.error };
  }

  const { applicationId, candidateId, organizationId } = result.payload;
  const supabase = createServiceClient();

  // Fetch application with joined data
  const { data: application } = await supabase
    .from("applications")
    .select(
      "id, status, current_stage_id, applied_at, hired_at, rejected_at, withdrawn_at, metadata, job_opening_id",
    )
    .eq("id", applicationId)
    .eq("candidate_id", candidateId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();

  if (!application) {
    return { error: "Application not found" };
  }

  // Fetch job details
  const { data: job } = await supabase
    .from("job_openings")
    .select("id, title, slug")
    .eq("id", application.job_opening_id)
    .single();

  // Fetch org name + plan
  const { data: org } = await supabase
    .from("organizations")
    .select("name, subscription_tier, feature_flags")
    .eq("id", organizationId)
    .single();

  // Fetch current stage info
  let currentStage: { name: string; stage_type: string; stage_order: number } | null = null;
  if (application.current_stage_id) {
    const { data } = await supabase
      .from("pipeline_stages")
      .select("name, stage_type, stage_order")
      .eq("id", application.current_stage_id)
      .single();
    currentStage = data;
  }

  // Fetch all pipeline stages for progress indicator
  const { data: allStages } = await supabase
    .from("pipeline_stages")
    .select("id, name, stage_type, stage_order, is_terminal")
    .eq(
      "pipeline_template_id",
      (
        await supabase
          .from("job_openings")
          .select("pipeline_template_id")
          .eq("id", application.job_opening_id)
          .single()
      ).data?.pipeline_template_id ?? "",
    )
    .is("deleted_at", null)
    .order("stage_order", { ascending: true });

  // Fetch stage history for timeline
  const { data: stageHistory } = await supabase
    .from("application_stage_history")
    .select("id, from_stage_id, to_stage_id, created_at")
    .eq("application_id", applicationId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  // Calculate days in current stage
  const lastTransition =
    stageHistory && stageHistory.length > 0
      ? stageHistory[stageHistory.length - 1]!.created_at
      : application.applied_at;
  const daysInStage = Math.floor(
    (Date.now() - new Date(lastTransition).getTime()) / (1000 * 60 * 60 * 24),
  );

  // AI narration for Growth+ only
  let narration: string | null = null;
  const plan = (org?.subscription_tier ?? "starter") as string;
  const isGrowthPlus =
    isValidPlan(plan) &&
    (["growth", "pro", "enterprise"] as PlanTier[]).includes(plan as PlanTier);

  if (isGrowthPlus && currentStage) {
    // Check cached narration — only regenerate on stage change
    const cached = application.metadata as Record<string, unknown> | null;
    const cachedNarration = cached?.status_narration as string | undefined;
    const cachedStageId = cached?.narration_stage_id as string | undefined;

    if (cachedNarration && cachedStageId === application.current_stage_id) {
      narration = cachedNarration;
    } else {
      // Generate fresh narration
      const result = await generateCandidateStatusNarration({
        stageType: currentStage.stage_type,
        daysInStage,
        jobTitle: job?.title ?? "this position",
        orgName: org?.name ?? "the company",
        organizationId,
      });

      if (result.narration) {
        narration = result.narration;

        // Cache in metadata (fire-and-forget)
        const updatedMetadata = {
          ...(cached ?? {}),
          status_narration: result.narration,
          narration_generated_at: new Date().toISOString(),
          narration_stage_id: application.current_stage_id,
        };
        await supabase
          .from("applications")
          .update({ metadata: updatedMetadata, updated_at: new Date().toISOString() })
          .eq("id", applicationId)
          .eq("organization_id", organizationId);
      }
    }
  }

  // Build stage lookup for timeline labels
  const stageMap = new Map(
    (allStages ?? []).map((s) => [s.id, { name: s.name, stage_type: s.stage_type }]),
  );

  const timeline = [
    {
      event: "Application submitted",
      date: application.applied_at,
      stageType: "applied",
    },
    ...(stageHistory ?? []).map((h) => ({
      event: `Moved to ${stageMap.get(h.to_stage_id)?.name ?? "next stage"}`,
      date: h.created_at,
      stageType: stageMap.get(h.to_stage_id)?.stage_type ?? "screening",
    })),
    ...(application.hired_at
      ? [{ event: "Hired", date: application.hired_at, stageType: "hired" as const }]
      : []),
    ...(application.rejected_at
      ? [{ event: "Not selected", date: application.rejected_at, stageType: "rejected" as const }]
      : []),
    ...(application.withdrawn_at
      ? [{ event: "Application withdrawn", date: application.withdrawn_at, stageType: "withdrawn" as const }]
      : []),
  ];

  return {
    application: {
      id: application.id,
      status: application.status,
      appliedAt: application.applied_at,
    },
    job: job ? { title: job.title, slug: job.slug } : null,
    org: org ? { name: org.name } : null,
    currentStage: currentStage
      ? {
          name: currentStage.name,
          stageType: currentStage.stage_type,
          order: currentStage.stage_order,
        }
      : null,
    stages: (allStages ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      stageType: s.stage_type,
      order: s.stage_order,
      isTerminal: s.is_terminal,
    })),
    timeline,
    daysInStage,
    narration,
    isGrowthPlus,
  };
}

/**
 * D32 §5.1 / D09 §6.4 — Withdraw application from the candidate portal.
 * Public action — no auth required. Token-based access only.
 */
export async function withdrawApplication(token: string) {
  const result = verifyStatusToken(token);
  if (!result.valid) {
    return { error: result.error };
  }

  const { applicationId, candidateId, organizationId } = result.payload;
  const supabase = createServiceClient();

  // Verify application exists and is withdrawable
  const { data: application } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", applicationId)
    .eq("candidate_id", candidateId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();

  if (!application) {
    return { error: "Application not found" };
  }

  if (application.status !== "active") {
    return { error: `Cannot withdraw — application status is "${application.status}"` };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("applications")
    .update({
      status: "withdrawn",
      withdrawn_at: now,
      updated_at: now,
    })
    .eq("id", applicationId)
    .eq("organization_id", organizationId);

  if (error) {
    logger.error({ error, applicationId }, "Failed to withdraw application");
    return { error: "Failed to withdraw application" };
  }

  return { success: true };
}
