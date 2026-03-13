import { NextResponse, type NextRequest } from "next/server";
import { verifyScreeningToken } from "@/lib/utils/candidate-token";
import { createServiceClient } from "@/lib/supabase/server";
import { problemResponse } from "@/lib/utils/problem";
import type { ScreeningQuestion, ScreeningTurn } from "@/lib/types/ground-truth";

/**
 * D32 §8 — GET /api/portal/screening/:sessionId
 * Get screening session data for the candidate portal.
 * Auth: candidate screening token (HMAC).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return problemResponse(401, "ATS-AU01", "Token required");
  }

  const result = verifyScreeningToken(token);
  if (!result.valid) {
    return problemResponse(401, "ATS-AU01", result.error);
  }

  if (result.payload.sessionId !== sessionId) {
    return problemResponse(403, "ATS-AU04", "Token does not match session");
  }

  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from("screening_sessions")
    .select("*, screening_configs!inner(questions, instructions, max_duration_min)")
    .eq("id", sessionId)
    .eq("organization_id", result.payload.organizationId)
    .is("deleted_at", null)
    .single();

  if (!session) {
    return problemResponse(404, "ATS-NF01", "Screening session not found");
  }

  // Fetch job title for display
  const config = session.screening_configs as unknown as {
    questions: ScreeningQuestion[];
    instructions: string | null;
    max_duration_min: number;
  };

  const { data: application } = await supabase
    .from("applications")
    .select("job_opening_id")
    .eq("id", session.application_id)
    .single();

  let jobTitle = "this position";
  if (application) {
    const { data: job } = await supabase
      .from("job_openings")
      .select("title")
      .eq("id", application.job_opening_id)
      .single();
    if (job) jobTitle = job.title;
  }

  // Fetch org name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", result.payload.organizationId)
    .single();

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      turns: session.turns as ScreeningTurn[],
      startedAt: session.started_at,
      completedAt: session.completed_at,
      humanReviewRequested: session.human_review_requested,
    },
    config: {
      questions: config.questions,
      instructions: config.instructions,
      maxDurationMin: config.max_duration_min,
    },
    jobTitle,
    orgName: org?.name ?? "the company",
  });
}
