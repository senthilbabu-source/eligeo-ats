"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import * as Sentry from "@sentry/nextjs";
import logger from "@/lib/utils/logger";
import { recordInteraction } from "@/lib/utils/record-interaction";
import { z } from "zod";
import type { InterviewType, InterviewStatus } from "@/lib/types/ground-truth";

// ── Helpers ────────────────────────────────────────────────

async function revalidateInterviewPaths(
  supabase: Awaited<ReturnType<typeof createClient>>,
  interviewId: string,
  orgId: string,
) {
  revalidatePath(`/candidates`);
  revalidatePath(`/jobs`);
  // Resolve candidate_id for detail page revalidation
  const { data: iv } = await supabase
    .from("interviews")
    .select("application_id")
    .eq("id", interviewId)
    .eq("organization_id", orgId)
    .single();
  if (iv) {
    const { data: app } = await supabase
      .from("applications")
      .select("candidate_id")
      .eq("id", iv.application_id)
      .single();
    if (app) {
      revalidatePath(`/candidates/${app.candidate_id}`);
    }
  }
}

// ── Validation Schemas ─────────────────────────────────────

const INTERVIEW_TYPES: InterviewType[] = [
  "phone_screen",
  "technical",
  "behavioral",
  "panel",
  "culture_fit",
  "final",
  "other",
];

const createInterviewSchema = z.object({
  applicationId: z.string().uuid(),
  interviewerId: z.string().uuid(),
  interviewType: z.enum(INTERVIEW_TYPES as [string, ...string[]]),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(60),
  location: z.string().max(500).optional(),
  meetingUrl: z.url().optional(),
  scorecardTemplateId: z.string().uuid().optional(),
  feedbackDeadlineAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

const updateInterviewSchema = z.object({
  id: z.string().uuid(),
  interviewType: z.enum(INTERVIEW_TYPES as [string, ...string[]]).optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
  location: z.string().max(500).optional(),
  meetingUrl: z.url().optional(),
  scorecardTemplateId: z.string().uuid().optional(),
  feedbackDeadlineAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  status: z
    .enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"])
    .optional(),
});

// ── Create Interview ───────────────────────────────────────

export async function createInterview(_prev: unknown, formData: FormData) {
  const session = await requireAuth();
  assertCan(session.orgRole, "interviews:create");

  const parsed = createInterviewSchema.safeParse({
    applicationId: formData.get("applicationId"),
    interviewerId: formData.get("interviewerId"),
    interviewType: formData.get("interviewType"),
    scheduledAt: formData.get("scheduledAt") || undefined,
    durationMinutes: formData.get("durationMinutes") || 60,
    location: formData.get("location") || undefined,
    meetingUrl: formData.get("meetingUrl") || undefined,
    scorecardTemplateId: formData.get("scorecardTemplateId") || undefined,
    feedbackDeadlineAt: formData.get("feedbackDeadlineAt") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: "Invalid input. Please check all fields." };
  }

  const data = parsed.data;
  const supabase = await createClient();

  // Resolve job_id from application (server-side — never trust client)
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, job_opening_id, candidate_id")
    .eq("id", data.applicationId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (appErr || !app) {
    return { error: "Application not found." };
  }

  const { data: interview, error } = await supabase
    .from("interviews")
    .insert({
      organization_id: session.orgId,
      application_id: data.applicationId,
      job_id: app.job_opening_id,
      interviewer_id: data.interviewerId,
      interview_type: data.interviewType,
      scheduled_at: data.scheduledAt,
      duration_minutes: data.durationMinutes,
      location: data.location,
      meeting_url: data.meetingUrl,
      scorecard_template_id: data.scorecardTemplateId,
      feedback_deadline_at: data.feedbackDeadlineAt,
      notes: data.notes,
      status: "scheduled",
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) {
    logger.error({ error }, "Failed to create interview");
    Sentry.captureException(error);
    return { error: "Failed to schedule interview." };
  }

  // H3-1: Record interview scheduling on candidate timeline
  await recordInteraction(supabase, {
    candidateId: app.candidate_id,
    organizationId: session.orgId,
    actorId: session.userId,
    type: "interview_scheduled",
    summary: `${data.interviewType.replace("_", " ")} interview scheduled${data.scheduledAt ? ` for ${new Date(data.scheduledAt).toLocaleDateString()}` : ""}`,
  });

  revalidatePath(`/candidates`);
  revalidatePath(`/candidates/${app.candidate_id}`);
  revalidatePath(`/jobs`);

  return { success: true, id: interview.id };
}

// ── Update Interview ───────────────────────────────────────

export async function updateInterview(input: {
  id: string;
  interviewType?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  location?: string;
  meetingUrl?: string;
  scorecardTemplateId?: string;
  feedbackDeadlineAt?: string;
  notes?: string;
  status?: string;
}) {
  const session = await requireAuth();
  assertCan(session.orgRole, "interviews:edit");

  const parsed = updateInterviewSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input." };
  }

  const data = parsed.data;
  const supabase = await createClient();

  // Build update payload (only changed fields)
  const updates: Record<string, unknown> = {};
  if (data.interviewType !== undefined)
    updates.interview_type = data.interviewType;
  if (data.scheduledAt !== undefined) updates.scheduled_at = data.scheduledAt;
  if (data.durationMinutes !== undefined)
    updates.duration_minutes = data.durationMinutes;
  if (data.location !== undefined) updates.location = data.location;
  if (data.meetingUrl !== undefined) updates.meeting_url = data.meetingUrl;
  if (data.scorecardTemplateId !== undefined)
    updates.scorecard_template_id = data.scorecardTemplateId;
  if (data.feedbackDeadlineAt !== undefined)
    updates.feedback_deadline_at = data.feedbackDeadlineAt;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.status !== undefined) updates.status = data.status;

  if (Object.keys(updates).length === 0) {
    return { error: "No changes provided." };
  }

  const { data: updated, error } = await supabase
    .from("interviews")
    .update(updates)
    .eq("id", data.id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .select("id")
    .single();

  if (error || !updated) {
    logger.error({ error, interviewId: data.id }, "Failed to update interview");
    Sentry.captureException(error);
    return { error: "Failed to update interview." };
  }

  await revalidateInterviewPaths(supabase, data.id, session.orgId);

  return { success: true };
}

// ── Mark Complete / No-Show ────────────────────────────────

export async function completeInterview(interviewId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "interviews:edit");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("interviews")
    .update({ status: "completed" as InterviewStatus })
    .eq("id", interviewId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .in("status", ["scheduled", "confirmed"])
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Cannot complete this interview." };
  }

  await revalidateInterviewPaths(supabase, interviewId, session.orgId);

  return { success: true };
}

export async function markNoShow(interviewId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "interviews:edit");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("interviews")
    .update({ status: "no_show" as InterviewStatus })
    .eq("id", interviewId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .in("status", ["scheduled", "confirmed"])
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Cannot mark this interview as no-show." };
  }

  await revalidateInterviewPaths(supabase, interviewId, session.orgId);

  return { success: true };
}

// ── Cancel Interview (soft delete) ─────────────────────────

export async function cancelInterview(interviewId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "interviews:edit");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("interviews")
    .update({ status: "cancelled" as InterviewStatus })
    .eq("id", interviewId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .in("status", ["scheduled", "confirmed"])
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Cannot cancel this interview." };
  }

  await revalidateInterviewPaths(supabase, interviewId, session.orgId);

  return { success: true };
}

// ── Get Interviews for Application ─────────────────────────

export async function getInterviewsForApplication(applicationId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "interviews:view");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("interviews")
    .select(
      `
      id,
      interview_type,
      scheduled_at,
      duration_minutes,
      location,
      meeting_url,
      status,
      notes,
      scorecard_template_id,
      feedback_deadline_at,
      interviewer_id,
      created_at
    `,
    )
    .eq("application_id", applicationId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  if (error) {
    logger.error({ error, applicationId }, "Failed to fetch interviews");
    return { error: "Failed to load interviews." };
  }

  return { success: true, data: data ?? [] };
}

// ── Get Single Interview ───────────────────────────────────

export async function getInterview(interviewId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "interviews:view");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("interviews")
    .select(
      `
      id,
      application_id,
      job_id,
      interview_type,
      scheduled_at,
      duration_minutes,
      location,
      meeting_url,
      status,
      notes,
      scorecard_template_id,
      feedback_deadline_at,
      interviewer_id,
      created_by,
      created_at,
      updated_at
    `,
    )
    .eq("id", interviewId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    return { error: "Interview not found." };
  }

  return { success: true, data };
}
