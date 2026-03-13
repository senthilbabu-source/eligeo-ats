import { NextResponse, type NextRequest } from "next/server";
import { verifyScreeningToken } from "@/lib/utils/candidate-token";
import { createServiceClient } from "@/lib/supabase/server";
import { problemResponse } from "@/lib/utils/problem";
import { inngest } from "@/inngest/client";

/**
 * D32 §8 — POST /api/portal/screening/:sessionId/complete
 * Mark screening session as ready for summary generation.
 * Auth: candidate screening token (HMAC).
 */
export async function POST(
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
  const { organizationId } = result.payload;

  // Load session
  const { data: session } = await supabase
    .from("screening_sessions")
    .select("id, status, turns")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();

  if (!session) {
    return problemResponse(404, "ATS-NF01", "Session not found");
  }

  if (session.status === "completed") {
    return problemResponse(409, "ATS-CO01", "Session already completed");
  }

  if (session.status === "pending") {
    return problemResponse(409, "ATS-CO01", "Session has no answers yet");
  }

  // Fire Inngest event for summary generation
  await inngest.send({
    name: "ats/screening.all-answered",
    data: {
      sessionId,
      organizationId,
    },
  });

  return NextResponse.json({ submitted: true });
}
