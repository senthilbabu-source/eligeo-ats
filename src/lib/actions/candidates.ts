"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { inngest } from "@/inngest/client";
import * as Sentry from "@sentry/nextjs";
import logger from "@/lib/utils/logger";
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
  resumeText: z.string().optional(),
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
    resumeText: (formData.get("resumeText") as string) || undefined,
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
      resume_text: data.resumeText,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A candidate with this email already exists" };
    }
    return { error: "Failed to create candidate" };
  }

  // Fire event for async embedding generation (P0-1)
  await inngest.send({
    name: "ats/candidate.created",
    data: {
      candidateId: candidate.id,
      organizationId: session.orgId,
    },
  });

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
    .eq("id", id)
    .eq("organization_id", session.orgId);

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
    .select("id, current_stage_id, organization_id, candidate_id")
    .eq("id", applicationId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (fetchError || !app) {
    return { error: "Application not found" };
  }

  // Update application's current stage
  const { error: updateError } = await supabase
    .from("applications")
    .update({ current_stage_id: toStageId })
    .eq("id", applicationId)
    .eq("organization_id", app.organization_id);

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
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${app.candidate_id}`);
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
    .eq("status", "active")
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

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

  // Verify candidate exists and is not soft-deleted
  const { data: candidateCheck } = await supabase
    .from("candidates")
    .select("id")
    .eq("id", candidateId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!candidateCheck) {
    return { error: "Candidate not found" };
  }

  // Verify job exists and is not soft-deleted
  const { data: jobCheck } = await supabase
    .from("job_openings")
    .select("id")
    .eq("id", jobOpeningId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!jobCheck) {
    return { error: "Job not found" };
  }

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

// ── Candidate Notes ──────────────────────────────────────

const addNoteSchema = z.object({
  candidateId: z.string().uuid(),
  content: z.string().min(1).max(5000),
});

export async function addCandidateNote(
  _prev: unknown,
  formData: FormData,
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:view");

  const parsed = addNoteSchema.safeParse({
    candidateId: formData.get("candidateId"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return { error: "Note content is required (max 5000 characters)" };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("candidate_notes").insert({
    organization_id: session.orgId,
    candidate_id: parsed.data.candidateId,
    content: parsed.data.content,
    created_by: session.userId,
  });

  if (error) {
    logger.error({ error }, "Failed to add candidate note");
    Sentry.captureException(error);
    return { error: "Failed to add note" };
  }

  revalidatePath(`/candidates/${parsed.data.candidateId}`);
  return { success: true };
}

export async function deleteCandidateNote(noteId: string, candidateId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:view");

  const supabase = await createClient();

  const { error } = await supabase
    .from("candidate_notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (error) {
    logger.error({ error }, "Failed to delete candidate note");
    Sentry.captureException(error);
    return { error: "Failed to delete note" };
  }

  revalidatePath(`/candidates/${candidateId}`);
  return { success: true };
}
