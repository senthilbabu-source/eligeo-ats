"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { z } from "zod/v4";

// ── Validation Schemas ─────────────────────────────────────

const createCandidateSchema = z.object({
  fullName: z.string().min(1).max(255),
  email: z.email(),
  phone: z.string().optional(),
  currentTitle: z.string().optional(),
  currentCompany: z.string().optional(),
  location: z.string().optional(),
  linkedinUrl: z.url().optional(),
  source: z.string().optional(),
  sourceId: z.string().uuid().optional(),
  skills: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

const updateCandidateSchema = createCandidateSchema.partial().extend({
  id: z.string().uuid(),
});

// ── Create Candidate ───────────────────────────────────────

export async function createCandidate(_prev: unknown, formData: FormData) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:create");

  const skillsRaw = formData.get("skills");
  const tagsRaw = formData.get("tags");

  const parsed = createCandidateSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    currentTitle: formData.get("currentTitle") || undefined,
    currentCompany: formData.get("currentCompany") || undefined,
    location: formData.get("location") || undefined,
    linkedinUrl: formData.get("linkedinUrl") || undefined,
    source: formData.get("source") || undefined,
    sourceId: formData.get("sourceId") || undefined,
    skills: skillsRaw ? JSON.parse(skillsRaw as string) : [],
    tags: tagsRaw ? JSON.parse(tagsRaw as string) : [],
  });

  if (!parsed.success) {
    return { error: "Invalid input. Please check all fields." };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const { data: candidate, error } = await supabase
    .from("candidates")
    .insert({
      organization_id: session.orgId,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      current_title: data.currentTitle,
      current_company: data.currentCompany,
      location: data.location,
      linkedin_url: data.linkedinUrl,
      source: data.source,
      source_id: data.sourceId,
      skills: data.skills,
      tags: data.tags,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A candidate with this email already exists" };
    }
    return { error: "Failed to create candidate" };
  }

  revalidatePath("/candidates");
  return { success: true, id: candidate.id };
}

// ── Update Candidate ───────────────────────────────────────

export async function updateCandidate(formData: FormData) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:edit");

  const parsed = updateCandidateSchema.safeParse({
    id: formData.get("id"),
    fullName: formData.get("fullName") || undefined,
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    currentTitle: formData.get("currentTitle") || undefined,
    currentCompany: formData.get("currentCompany") || undefined,
    location: formData.get("location") || undefined,
    linkedinUrl: formData.get("linkedinUrl") || undefined,
  });

  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const { id, ...updates } = parsed.data;
  const supabase = await createClient();

  const dbUpdates: Record<string, unknown> = {};
  if (updates.fullName) dbUpdates.full_name = updates.fullName;
  if (updates.email) dbUpdates.email = updates.email;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.currentTitle !== undefined) dbUpdates.current_title = updates.currentTitle;
  if (updates.currentCompany !== undefined) dbUpdates.current_company = updates.currentCompany;
  if (updates.location !== undefined) dbUpdates.location = updates.location;
  if (updates.linkedinUrl !== undefined) dbUpdates.linkedin_url = updates.linkedinUrl;

  const { error } = await supabase
    .from("candidates")
    .update(dbUpdates)
    .eq("id", id);

  if (error) {
    return { error: "Failed to update candidate" };
  }

  revalidatePath("/candidates");
  revalidatePath(`/candidates/${id}`);
  return { success: true };
}

// ── Move Application Stage ─────────────────────────────────

export async function moveStage(
  applicationId: string,
  toStageId: string,
  reason?: string,
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "applications:move");

  const supabase = await createClient();

  // Get current stage
  const { data: app, error: fetchError } = await supabase
    .from("applications")
    .select("id, current_stage_id, organization_id")
    .eq("id", applicationId)
    .single();

  if (fetchError || !app) {
    return { error: "Application not found" };
  }

  // Update application's current stage
  const { error: updateError } = await supabase
    .from("applications")
    .update({ current_stage_id: toStageId })
    .eq("id", applicationId);

  if (updateError) {
    return { error: "Failed to move stage" };
  }

  // Record stage transition (append-only history)
  const { error: historyError } = await supabase
    .from("application_stage_history")
    .insert({
      organization_id: app.organization_id,
      application_id: applicationId,
      from_stage_id: app.current_stage_id,
      to_stage_id: toStageId,
      transitioned_by: session.userId,
      reason,
    });

  if (historyError) {
    return { error: "Stage moved but history recording failed" };
  }

  revalidatePath("/jobs");
  revalidatePath(`/candidates`);
  return { success: true };
}

// ── Reject Application ─────────────────────────────────────

export async function rejectApplication(
  applicationId: string,
  rejectionReasonId?: string,
  notes?: string,
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "applications:move");

  const supabase = await createClient();

  const { error } = await supabase
    .from("applications")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejection_reason_id: rejectionReasonId,
      rejection_notes: notes,
    })
    .eq("id", applicationId)
    .eq("status", "active");

  if (error) {
    return { error: "Failed to reject application" };
  }

  revalidatePath("/jobs");
  revalidatePath("/candidates");
  return { success: true };
}

// ── Create Application ─────────────────────────────────────

export async function createApplication(
  candidateId: string,
  jobOpeningId: string,
  stageId: string,
  source?: string,
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "applications:create");

  const supabase = await createClient();

  const { data: app, error } = await supabase
    .from("applications")
    .insert({
      organization_id: session.orgId,
      candidate_id: candidateId,
      job_opening_id: jobOpeningId,
      current_stage_id: stageId,
      status: "active",
      source,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Candidate has already applied to this job" };
    }
    return { error: "Failed to create application" };
  }

  // Record initial stage entry
  await supabase.from("application_stage_history").insert({
    organization_id: session.orgId,
    application_id: app.id,
    from_stage_id: null,
    to_stage_id: stageId,
    transitioned_by: session.userId,
  });

  revalidatePath("/jobs");
  revalidatePath("/candidates");
  return { success: true, id: app.id };
}
