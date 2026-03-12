import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyVerificationToken } from "@/lib/utils/email-verification";

/**
 * H1-4: Public email verification endpoint.
 * Candidate clicks link → token is verified → email_verified_at is set.
 * GET /api/verify-email?token=xxx
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const result = verifyVerificationToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Set email_verified_at on the candidate
  const { error } = await supabase
    .from("candidates")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", result.candidateId)
    .eq("email", result.email)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 },
    );
  }

  // Redirect to a simple confirmation page or career portal
  return NextResponse.redirect(
    new URL("/careers?verified=true", request.url),
  );
}
