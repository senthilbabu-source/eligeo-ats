"use server";

import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import logger from "@/lib/utils/logger";
import { parseResume } from "@/lib/ai/resume-parser";
import { generateJobDescription, generateEmailDraft } from "@/lib/ai/generate";
import {
  generateAndStoreEmbedding,
  buildCandidateEmbeddingText,
  buildJobEmbeddingText,
} from "@/lib/ai/embeddings";
import { getRemainingCredits } from "@/lib/ai/credits";
import { CONFIG } from "@/lib/constants/config";

// ── AI Resume Parse ───────────────────────────────────────

export async function aiParseResume(
  _prev: unknown,
  formData: FormData,
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:create");

  const resumeText = formData.get("resumeText") as string;
  if (!resumeText?.trim()) {
    return { error: "No resume text provided" };
  }

  const result = await parseResume({
    resumeText,
    organizationId: session.orgId,
    userId: session.userId,
  });

  if (result.error) {
    logger.error({ error: result.error }, "AI resume parse failed");
    return { error: "Failed to parse resume. Please try again." };
  }

  return { success: true, data: result.data };
}

// ── Generate Embeddings ───────────────────────────────────

export async function aiGenerateCandidateEmbedding(candidateId: string) {
  const session = await requireAuth();
  const supabase = await createClient();

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, organization_id, resume_text, skills, current_title, current_company")
    .eq("id", candidateId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!candidate) return { error: "Candidate not found" };

  const text = buildCandidateEmbeddingText(candidate);
  if (!text) return { error: "No content available for embedding generation" };

  return generateAndStoreEmbedding({
    organizationId: candidate.organization_id,
    userId: session.userId,
    entityType: "candidate",
    entityId: candidateId,
    text,
  });
}

export async function aiGenerateJobEmbedding(jobId: string) {
  const session = await requireAuth();
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("job_openings")
    .select("id, organization_id, title, description")
    .eq("id", jobId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!job) return { error: "Job not found" };

  // Get required skills
  const { data: skills } = await supabase
    .from("job_required_skills")
    .select("skills:skill_id (name)")
    .eq("job_id", jobId)
    .is("deleted_at", null);

  const skillNames = (skills ?? []).map((s) => {
    const raw = s.skills as unknown;
    const skill = (Array.isArray(raw) ? raw[0] : raw) as { name: string } | null;
    return skill?.name ?? "";
  }).filter(Boolean);

  const text = buildJobEmbeddingText({
    title: job.title,
    description: job.description,
    required_skills: skillNames,
  });

  return generateAndStoreEmbedding({
    organizationId: job.organization_id,
    userId: session.userId,
    entityType: "job_opening",
    entityId: jobId,
    text,
  });
}

// ── AI Match Candidates ───────────────────────────────────

export async function aiMatchCandidates(jobId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:view");

  const supabase = createServiceClient();

  const { data: matches, error } = await supabase.rpc(
    "match_candidates_for_job",
    {
      p_job_id: jobId,
      p_organization_id: session.orgId,
      p_similarity_threshold: CONFIG.AI.SIMILARITY_THRESHOLD,
      p_max_results: CONFIG.AI.MAX_MATCH_RESULTS,
    },
  );

  if (error) {
    logger.error({ err: error, jobId }, "AI match candidates RPC failed");
    return { error: "Failed to find matches. Please try again." };
  }

  const credits = await getRemainingCredits(session.orgId);

  return {
    success: true,
    matches: matches ?? [],
    creditsRemaining: credits.remaining,
  };
}

// ── AI Job Description ────────────────────────────────────

export async function aiGenerateJobDescription(
  _prev: unknown,
  formData: FormData,
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "jobs:create");

  const title = formData.get("title") as string;
  const department = (formData.get("department") as string) || undefined;
  const keyPoints = (formData.get("keyPoints") as string) || undefined;

  if (!title?.trim()) {
    return { error: "Job title is required" };
  }

  const result = await generateJobDescription({
    title,
    department,
    keyPoints,
    organizationId: session.orgId,
    userId: session.userId,
  });

  if (result.error) {
    logger.error({ error: result.error }, "AI job description generation failed");
    return { error: "Failed to generate description. Please try again." };
  }

  return { success: true, text: result.text };
}

// ── AI Score Feedback ─────────────────────────────────────

export async function submitScoreFeedback({
  candidateId,
  jobId,
  signal,
  matchScoreAtTime,
}: {
  candidateId: string;
  jobId: string;
  signal: "thumbs_up" | "thumbs_down";
  matchScoreAtTime?: number;
}): Promise<{ success: true } | { error: string }> {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:view");

  const supabase = await createClient();

  // Look up the most recent application for this candidate + job (any non-deleted status)
  const { data: application } = await supabase
    .from("applications")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("job_opening_id", jobId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!application) {
    return { error: "no_application" };
  }

  const { error } = await supabase.from("ai_score_feedback").insert({
    organization_id: session.orgId,
    application_id: application.id,
    signal,
    given_by: session.userId,
    match_score_at_time: matchScoreAtTime ?? null,
  });

  if (error) {
    logger.error({ error, candidateId, jobId }, "submitScoreFeedback failed");
    return { error: "Failed to save feedback. Please try again." };
  }

  return { success: true };
}

// ── AI Email Draft ────────────────────────────────────────

export async function aiDraftEmail(
  _prev: unknown,
  formData: FormData,
) {
  const session = await requireAuth();

  const type = formData.get("type") as "rejection" | "outreach" | "update" | "follow_up";
  const candidateName = formData.get("candidateName") as string;
  const jobTitle = formData.get("jobTitle") as string;
  const context = (formData.get("context") as string) || undefined;
  const tone = (formData.get("tone") as "warm" | "professional" | "casual") || "warm";

  if (!candidateName || !jobTitle || !type) {
    return { error: "Missing required fields" };
  }

  const result = await generateEmailDraft({
    type,
    candidateName,
    jobTitle,
    context,
    tone,
    organizationId: session.orgId,
    userId: session.userId,
  });

  if (result.error) {
    logger.error({ error: result.error }, "AI email draft generation failed");
    return { error: "Failed to generate email. Please try again." };
  }

  return { success: true, subject: result.subject, body: result.body };
}
