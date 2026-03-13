import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";
import { problemResponse } from "@/lib/utils/problem";
import type { ScreeningQuestion } from "@/lib/types/ground-truth";

/**
 * D32 §8 — GET /api/jobs/:id/screening-config
 * Get screening configuration for a job.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuthAPI();
  if (error) return error;

  const { id: jobId } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("screening_configs")
    .select("*")
    .eq("organization_id", session.orgId)
    .eq("job_opening_id", jobId)
    .is("deleted_at", null)
    .single();

  if (!data) {
    return NextResponse.json({ config: null });
  }

  return NextResponse.json({
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
  });
}

/**
 * D32 §8 — PUT /api/jobs/:id/screening-config
 * Create or update screening configuration.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuthAPI();
  if (error) return error;

  // Role check: recruiter+
  if (!["owner", "admin", "recruiter"].includes(session.orgRole)) {
    return problemResponse(403, "ATS-AU04", "Insufficient permissions");
  }

  const { id: jobId } = await params;
  const body = await request.json();
  const { questions, instructions, maxDurationMin, isActive } = body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return problemResponse(400, "ATS-VA01", "At least one question is required");
  }

  if (questions.length > 10) {
    return problemResponse(400, "ATS-VA01", "Maximum 10 questions allowed");
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  // Check if config already exists
  const { data: existing } = await supabase
    .from("screening_configs")
    .select("id")
    .eq("organization_id", session.orgId)
    .eq("job_opening_id", jobId)
    .is("deleted_at", null)
    .single();

  if (existing) {
    const { error: updateErr } = await supabase
      .from("screening_configs")
      .update({
        questions,
        instructions: instructions ?? null,
        max_duration_min: maxDurationMin ?? 15,
        is_active: isActive ?? true,
        updated_at: now,
      })
      .eq("id", existing.id)
      .eq("organization_id", session.orgId);

    if (updateErr) {
      return problemResponse(500, "ATS-DB01", "Failed to update screening config");
    }

    return NextResponse.json({ configId: existing.id });
  }

  const { data, error: insertErr } = await supabase
    .from("screening_configs")
    .insert({
      organization_id: session.orgId,
      job_opening_id: jobId,
      questions,
      instructions: instructions ?? null,
      max_duration_min: maxDurationMin ?? 15,
      is_active: isActive ?? true,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (insertErr || !data) {
    return problemResponse(500, "ATS-DB01", "Failed to create screening config");
  }

  return NextResponse.json({ configId: data.id }, { status: 201 });
}
