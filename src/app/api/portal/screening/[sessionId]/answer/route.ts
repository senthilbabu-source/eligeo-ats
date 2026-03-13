import { NextResponse, type NextRequest } from "next/server";
import { verifyScreeningToken } from "@/lib/utils/candidate-token";
import { createServiceClient } from "@/lib/supabase/server";
import { problemResponse } from "@/lib/utils/problem";
import { evaluateCandidateAnswer } from "@/lib/ai/screening";
import { isValidPlan, type PlanTier } from "@/lib/billing/plans";
import type { ScreeningQuestion, ScreeningTurn } from "@/lib/types/ground-truth";
import { randomUUID } from "crypto";

/**
 * D32 §8 — POST /api/portal/screening/:sessionId/answer
 * Submit a screening answer. AI evaluates and may return a follow-up.
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

  const body = await request.json();
  const { questionId, answer, aiQuestionText, isFollowUp } = body;

  if (!questionId || !answer || typeof answer !== "string") {
    return problemResponse(400, "ATS-VA01", "questionId and answer are required");
  }

  const supabase = createServiceClient();
  const { organizationId } = result.payload;

  // Load session
  const { data: session } = await supabase
    .from("screening_sessions")
    .select("*, screening_configs!inner(questions)")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();

  if (!session) {
    return problemResponse(404, "ATS-NF01", "Session not found");
  }

  if (session.status === "completed" || session.status === "abandoned") {
    return problemResponse(409, "ATS-CO01", "Session is already finished");
  }

  const now = new Date().toISOString();
  const turns = (session.turns ?? []) as ScreeningTurn[];
  const questions = (session.screening_configs as unknown as { questions: ScreeningQuestion[] }).questions;

  // If this is a follow-up answer, update the existing turn
  if (isFollowUp) {
    const existingTurn = turns.find((t) => t.question_id === questionId);
    if (existingTurn) {
      existingTurn.candidate_follow_up_answer = answer;
    }
  } else {
    // New answer — create turn
    const question = questions.find((q) => q.id === questionId);
    const newTurn: ScreeningTurn = {
      id: randomUUID(),
      question_id: questionId,
      ai_question_text: aiQuestionText ?? question?.raw_question ?? "",
      candidate_answer: answer,
      timestamp: now,
    };
    turns.push(newTurn);
  }

  // Mark in_progress if first answer
  const updates: Record<string, unknown> = {
    turns,
    updated_at: now,
  };
  if (session.status === "pending") {
    updates.status = "in_progress";
    updates.started_at = now;
  }

  await supabase
    .from("screening_sessions")
    .update(updates)
    .eq("id", sessionId)
    .eq("organization_id", organizationId);

  // AI evaluation (Growth+ only)
  const { data: org } = await supabase
    .from("organizations")
    .select("subscription_tier")
    .eq("id", organizationId)
    .single();

  const plan = (org?.subscription_tier ?? "starter") as string;
  const isGrowthPlus =
    isValidPlan(plan) &&
    (["growth", "pro", "enterprise"] as PlanTier[]).includes(plan as PlanTier);

  let followUp: { needsFollowup: boolean; followupText?: string; preliminaryScore: number } | null = null;

  if (isGrowthPlus && !isFollowUp) {
    const question = questions.find((q) => q.id === questionId);
    if (question) {
      followUp = await evaluateCandidateAnswer({
        question,
        aiQuestionText: aiQuestionText ?? question.raw_question,
        answer,
        organizationId,
      });

      // If follow-up generated, save it to the turn
      if (followUp.needsFollowup && followUp.followupText) {
        const currentTurn = turns.find((t) => t.question_id === questionId && !t.ai_follow_up);
        if (currentTurn) {
          currentTurn.ai_follow_up = followUp.followupText;
          currentTurn.turn_score = followUp.preliminaryScore;
          await supabase
            .from("screening_sessions")
            .update({ turns, updated_at: now })
            .eq("id", sessionId)
            .eq("organization_id", organizationId);
        }
      }
    }
  }

  return NextResponse.json({
    saved: true,
    followUp: followUp?.needsFollowup
      ? { text: followUp.followupText }
      : null,
  });
}
