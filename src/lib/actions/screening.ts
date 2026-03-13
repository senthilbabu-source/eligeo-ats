"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { ScreeningQuestion } from "@/lib/types/ground-truth";

const questionSchema = z.object({
  id: z.string(),
  order: z.number(),
  topic: z.string().min(1),
  raw_question: z.string().min(5),
  is_required: z.boolean(),
  scoring_criteria: z.string().optional(),
});

const configSchema = z.object({
  jobOpeningId: z.string().uuid(),
  questions: z.array(questionSchema).min(1).max(10),
  instructions: z.string().optional(),
  maxDurationMin: z.number().min(5).max(60).default(15),
  isActive: z.boolean().default(true),
});

/**
 * D32 §7.6 — Create or update a screening config for a job.
 */
export async function upsertScreeningConfig(input: z.infer<typeof configSchema>) {
  const session = await requireAuth();
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid screening config" };
  }

  const { jobOpeningId, questions, instructions, maxDurationMin, isActive } = parsed.data;
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Check if config already exists for this job
  const { data: existing } = await supabase
    .from("screening_configs")
    .select("id")
    .eq("organization_id", session.orgId)
    .eq("job_opening_id", jobOpeningId)
    .is("deleted_at", null)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("screening_configs")
      .update({
        questions: questions as unknown as Record<string, unknown>[],
        instructions: instructions ?? null,
        max_duration_min: maxDurationMin,
        is_active: isActive,
        updated_at: now,
      })
      .eq("id", existing.id)
      .eq("organization_id", session.orgId);

    if (error) return { error: "Failed to update screening config" };
    revalidatePath(`/jobs/${jobOpeningId}`);
    return { ok: true, configId: existing.id };
  }

  const { data, error } = await supabase
    .from("screening_configs")
    .insert({
      organization_id: session.orgId,
      job_opening_id: jobOpeningId,
      questions: questions as unknown as Record<string, unknown>[],
      instructions: instructions ?? null,
      max_duration_min: maxDurationMin,
      is_active: isActive,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Failed to create screening config" };
  revalidatePath(`/jobs/${jobOpeningId}`);
  return { ok: true, configId: data.id };
}

/**
 * D32 §7.6 — Get screening config for a job.
 */
export async function getScreeningConfig(jobOpeningId: string) {
  const session = await requireAuth();
  const supabase = await createClient();

  const { data } = await supabase
    .from("screening_configs")
    .select("*")
    .eq("organization_id", session.orgId)
    .eq("job_opening_id", jobOpeningId)
    .is("deleted_at", null)
    .single();

  if (!data) return { config: null };

  return {
    config: {
      id: data.id,
      jobOpeningId: data.job_opening_id,
      questions: data.questions as ScreeningQuestion[],
      instructions: data.instructions,
      maxDurationMin: data.max_duration_min,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

/**
 * D32 §7.6 — Toggle screening active/inactive for a job.
 */
export async function toggleScreeningActive(configId: string, isActive: boolean) {
  const session = await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("screening_configs")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", configId)
    .eq("organization_id", session.orgId);

  if (error) return { error: "Failed to toggle screening" };
  return { ok: true };
}

/**
 * D32 §7.6 — Get screening results for a candidate (recruiter view).
 */
export async function getScreeningResults(candidateId: string) {
  const session = await requireAuth();
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("screening_sessions")
    .select("*, screening_configs!inner(job_opening_id, questions)")
    .eq("organization_id", session.orgId)
    .eq("candidate_id", candidateId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return { sessions: sessions ?? [] };
}

/**
 * D32 §14.2 — Request human review for a screening session.
 * Used from the candidate portal.
 */
export async function requestHumanReview(sessionId: string, organizationId: string) {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("screening_sessions")
    .update({
      human_review_requested: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("organization_id", organizationId);

  if (error) return { error: "Failed to request human review" };
  return { ok: true };
}
