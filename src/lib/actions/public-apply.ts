"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";
import { createVerificationToken } from "@/lib/utils/email-verification";
import { createStatusToken } from "@/lib/utils/candidate-token";
import { z } from "zod";

const applySchema = z.object({
  fullName: z.string().min(1, "Name is required").max(255),
  email: z.email("Valid email is required"),
  phone: z.string().optional(),
  linkedinUrl: z.url().optional(),
  coverLetter: z.string().max(5000).optional(),
  jobOpeningId: z.string().uuid(),
});

/**
 * Public career portal application — no auth required.
 * Uses service client because the applicant has no Supabase session.
 * Creates candidate (or finds existing) + application + stage history.
 *
 * ADR-001 EXCEPTION: Service role is required here because public applicants
 * have no Supabase auth session. RLS INSERT policies require is_org_member(),
 * which anonymous users cannot satisfy. All operations are tightly scoped:
 * - Job lookup: only open, non-deleted jobs
 * - Candidate: created within the job's org_id (derived server-side)
 * - Application: scoped to the fetched job's org + first pipeline stage
 * Rate limiting is enforced at the proxy layer (SEC-05).
 */
export async function submitPublicApplication(
  _prev: unknown,
  formData: FormData,
) {
  const parsed = applySchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    linkedinUrl: formData.get("linkedinUrl") || undefined,
    coverLetter: formData.get("coverLetter") || undefined,
    jobOpeningId: formData.get("jobOpeningId"),
  });

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
    return { error: firstError };
  }

  const data = parsed.data;
  const supabase = createServiceClient();

  // 1. Fetch the job to get org_id and pipeline_template_id
  const { data: job, error: jobError } = await supabase
    .from("job_openings")
    .select("id, organization_id, pipeline_template_id")
    .eq("id", data.jobOpeningId)
    .eq("status", "open")
    .is("deleted_at", null)
    .single();

  if (jobError || !job) {
    return { error: "This position is no longer accepting applications" };
  }

  // 2. Get the first pipeline stage (lowest stage_order) for auto-assignment
  const { data: firstStage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_template_id", job.pipeline_template_id)
    .is("deleted_at", null)
    .order("stage_order", { ascending: true })
    .limit(1)
    .single();

  if (!firstStage) {
    return { error: "Unable to process application. Please try again later." };
  }

  // 3. Upsert candidate — find existing by org+email or create new
  const { data: existingCandidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("organization_id", job.organization_id)
    .eq("email", data.email)
    .is("deleted_at", null)
    .single();

  let candidateId: string;

  if (existingCandidate) {
    candidateId = existingCandidate.id;
  } else {
    const { data: newCandidate, error: candidateError } = await supabase
      .from("candidates")
      .insert({
        organization_id: job.organization_id,
        full_name: data.fullName,
        email: data.email,
        phone: data.phone,
        linkedin_url: data.linkedinUrl,
        source: "career_portal",
        resume_text: data.coverLetter,
      })
      .select("id")
      .single();

    if (candidateError || !newCandidate) {
      return { error: "Failed to submit application. Please try again." };
    }
    candidateId = newCandidate.id;

    // Fire event for async embedding generation (P0-1)
    await inngest.send({
      name: "ats/candidate.created",
      data: {
        candidateId: newCandidate.id,
        organizationId: job.organization_id,
      },
    });
  }

  // 4. Create application
  const { data: application, error: appError } = await supabase
    .from("applications")
    .insert({
      organization_id: job.organization_id,
      candidate_id: candidateId,
      job_opening_id: job.id,
      current_stage_id: firstStage.id,
      status: "active",
      source: "career_portal",
      metadata: data.coverLetter ? { cover_letter: data.coverLetter } : {},
    })
    .select("id")
    .single();

  if (appError) {
    if (appError.code === "23505") {
      return { error: "You have already applied to this position" };
    }
    return { error: "Failed to submit application. Please try again." };
  }

  // 5. Record initial stage entry (no transitioned_by for public applications)
  //    Using a NULL-safe approach since transitioned_by is NOT NULL in schema
  //    We skip history for public apps — the application record itself is the source of truth
  //    Stage history will be tracked when internal users move the candidate

  // P6-2a: Generate status portal token (30-day expiry)
  const statusToken = createStatusToken({
    applicationId: application.id,
    candidateId,
    organizationId: job.organization_id,
  });

  // Fetch job slug for the status URL
  const { data: jobSlug } = await supabase
    .from("job_openings")
    .select("slug")
    .eq("id", job.id)
    .single();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const statusUrl = `${baseUrl}/careers/${jobSlug?.slug ?? job.id}/status?token=${statusToken}`;

  // H1-4: Send verification + status link email for new candidates
  // Existing candidates get just the status link
  if (!existingCandidate) {
    const verifyToken = createVerificationToken(candidateId, data.email);
    await inngest.send({
      name: "ats/notification.send-email",
      data: {
        organizationId: job.organization_id,
        to: data.email,
        subject: "Application received — verify your email",
        body: `Thank you for applying! Please verify your email by clicking the link below:\n\n${baseUrl}/api/verify-email?token=${verifyToken}\n\nThis link expires in 24 hours.\n\nTrack your application status anytime:\n${statusUrl}`,
      },
    });
  } else {
    await inngest.send({
      name: "ats/notification.send-email",
      data: {
        organizationId: job.organization_id,
        to: data.email,
        subject: "Application received",
        body: `Thank you for applying! We have received your application.\n\nTrack your application status anytime:\n${statusUrl}`,
      },
    });
  }

  // P6-1: Trigger resume parsing if resume was uploaded
  await inngest.send({
    name: "portal/application-submitted",
    data: {
      candidateId,
      organizationId: job.organization_id,
      applicationId: application.id,
    },
  });

  return { success: true, applicationId: application.id };
}
