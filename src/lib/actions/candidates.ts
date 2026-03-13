"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { inngest } from "@/inngest/client";
import * as Sentry from "@sentry/nextjs";
import logger from "@/lib/utils/logger";
import { recordInteraction } from "@/lib/utils/record-interaction";
import { z } from "zod";

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

// ── H1-3: Fuzzy Dedup Helper ──────────────────────────────
// Detects possible same-person duplicates when a candidate is created
// with a different email (same-email is blocked by UNIQUE constraint).

async function findPossibleDuplicates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  excludeId: string,
  _fullName: string,
  phone?: string,
  linkedinUrl?: string,
): Promise<Array<{ id: string; full_name: string; email: string }>> {
  if (!phone && !linkedinUrl) {
    // Without phone or LinkedIn, name-only matching has too many false positives
    return [];
  }

  const conditions: string[] = [];
  if (phone) {
    conditions.push(`phone.eq.${phone}`);
  }
  if (linkedinUrl) {
    conditions.push(`linkedin_url.eq.${linkedinUrl}`);
  }

  const { data } = await supabase
    .from("candidates")
    .select("id, full_name, email")
    .eq("organization_id", orgId)
    .neq("id", excludeId)
    .is("deleted_at", null)
    .or(conditions.join(","))
    .limit(5);

  return data ?? [];
}

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

  // H1-3: Fuzzy dedup — check for possible same-person duplicates (different email)
  const possibleDuplicates = await findPossibleDuplicates(
    supabase,
    session.orgId,
    candidate.id,
    data.fullName,
    data.phone,
    data.linkedinUrl,
  );

  // Fire event for async embedding generation (P0-1)
  await inngest.send({
    name: "ats/candidate.created",
    data: {
      candidateId: candidate.id,
      organizationId: session.orgId,
    },
  });

  revalidatePath("/candidates");
  return {
    success: true,
    id: candidate.id,
    possibleDuplicates: possibleDuplicates.length > 0 ? possibleDuplicates : undefined,
  };
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

  // H1-1: Atomic dual write via RPC — prevents split truth between
  // applications.current_stage_id and application_stage_history
  const { data, error } = await supabase.rpc("move_application_stage", {
    p_application_id: applicationId,
    p_organization_id: session.orgId,
    p_to_stage_id: toStageId,
    p_transitioned_by: session.userId,
    p_reason: reason ?? null,
  });

  if (error) {
    if (error.message?.includes("not found")) {
      return { error: "Application not found" };
    }
    return { error: "Failed to move stage" };
  }

  const result = Array.isArray(data) ? data[0] : data;
  const candidateId = result?.candidate_id;

  // H3-1: Record stage change on candidate timeline
  if (candidateId) {
    await recordInteraction(supabase, {
      candidateId,
      organizationId: session.orgId,
      actorId: session.userId,
      type: "stage_changed",
      summary: `Moved to stage ${toStageId}${reason ? ` — ${reason}` : ""}`,
    });
  }

  revalidatePath("/jobs");
  revalidatePath("/candidates");
  if (candidateId) {
    revalidatePath(`/candidates/${candidateId}`);
  }
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

// ── H4-3: Request Human Review (EU AI Act) ──────────────

export async function requestHumanReview(applicationId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "applications:move");

  const supabase = await createClient();

  const { error } = await supabase
    .from("applications")
    .update({ human_review_requested: true })
    .eq("id", applicationId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (error) {
    logger.error({ error }, "Failed to set human_review_requested");
    Sentry.captureException(error);
    return { error: "Failed to request human review" };
  }

  // Notify the recruiter/hiring manager
  await inngest.send({
    name: "ats/notification.requested",
    data: {
      organizationId: session.orgId,
      userId: session.userId,
      eventType: "human_review_requested",
      entityType: "application",
      entityId: applicationId,
    },
  });

  revalidatePath("/candidates");
  return { success: true };
}

// ── P6-1: Trigger Resume Re-Parse ────────────────────────

export async function triggerResumeParse(candidateId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:edit");

  const supabase = await createClient();

  // Verify candidate exists
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("id", candidateId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!candidate) {
    return { error: "Candidate not found" };
  }

  // Fire event to trigger Inngest resume parse function
  await inngest.send({
    name: "ats/candidate.resume-uploaded",
    data: {
      candidateId,
      organizationId: session.orgId,
    },
  });

  revalidatePath(`/candidates/${candidateId}`);
  return { success: true };
}

// ── P6-2b: Merge Candidates ─────────────────────────────

/**
 * D32 §5.4–§5.6 — Merge two candidate records.
 * Calls the atomic merge_candidates() RPC which:
 *   1. Repoints applications (dedupes same-job)
 *   2. Merges skills (skip duplicates)
 *   3. Repoints notes + files
 *   4. Creates candidate_merges audit record
 *   5. Soft-deletes secondary candidate
 * Post-merge: fires embedding refresh for the primary candidate.
 */
export async function mergeCandidate(
  primaryId: string,
  secondaryId: string,
  aiConfidence?: number,
  mergeReason?: string,
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:edit");

  if (primaryId === secondaryId) {
    return { error: "Cannot merge a candidate with itself" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("merge_candidates", {
    p_primary_id: primaryId,
    p_secondary_id: secondaryId,
    p_org_id: session.orgId,
    p_merged_by: session.userId,
    p_ai_confidence: aiConfidence ?? null,
    p_merge_reason: mergeReason ?? null,
  });

  if (error) {
    logger.error({ error, primaryId, secondaryId }, "Failed to merge candidates");
    Sentry.captureException(error);
    return { error: error.message ?? "Failed to merge candidates" };
  }

  // Post-merge: refresh embedding for primary candidate
  await inngest.send({
    name: "ats/candidate.skills_updated",
    data: {
      candidateId: primaryId,
      organizationId: session.orgId,
    },
  });

  revalidatePath("/candidates");
  revalidatePath(`/candidates/${primaryId}`);

  return { success: true, primaryId: data };
}

/**
 * D32 §5.5 — Fetch duplicate candidates for the merge modal.
 * Returns candidates matching by phone or LinkedIn URL.
 */
export async function getDuplicateCandidates(candidateId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:view");

  const supabase = await createClient();

  // Fetch the target candidate's identifying info
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name, email, phone, linkedin_url, current_company, current_title")
    .eq("id", candidateId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!candidate) {
    return { error: "Candidate not found", duplicates: [] };
  }

  // Find possible duplicates via fuzzy dedup
  const duplicates = await findPossibleDuplicates(
    supabase,
    session.orgId,
    candidateId,
    candidate.full_name,
    candidate.phone ?? undefined,
    candidate.linkedin_url ?? undefined,
  );

  // Enrich with full details for merge comparison
  if (duplicates.length === 0) {
    return { candidate, duplicates: [] };
  }

  const dupeIds = duplicates.map((d) => d.id);
  const { data: enriched } = await supabase
    .from("candidates")
    .select("id, full_name, email, phone, linkedin_url, current_company, current_title")
    .in("id", dupeIds)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  return { candidate, duplicates: enriched ?? [] };
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
