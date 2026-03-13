import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/server";
import { problemResponse } from "@/lib/utils/problem";
import type { ScreeningTurn, ScreeningQuestion } from "@/lib/types/ground-truth";

/**
 * D32 §8 — GET /api/candidates/:id/screening-results
 * Get screening results for a candidate (recruiter view).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuthAPI();
  if (error) return error;

  const { id: candidateId } = await params;
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("screening_sessions")
    .select("*, screening_configs!inner(job_opening_id, questions)")
    .eq("organization_id", session.orgId)
    .eq("candidate_id", candidateId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Fetch job titles for each session
  const jobIds = [
    ...new Set(
      sessions.map((s) => (s.screening_configs as unknown as { job_opening_id: string }).job_opening_id),
    ),
  ];
  const { data: jobs } = await supabase
    .from("job_openings")
    .select("id, title")
    .in("id", jobIds);

  const jobMap = new Map((jobs ?? []).map((j) => [j.id, j.title]));

  const results = sessions.map((s) => {
    const config = s.screening_configs as unknown as {
      job_opening_id: string;
      questions: ScreeningQuestion[];
    };
    return {
      id: s.id,
      status: s.status,
      jobTitle: jobMap.get(config.job_opening_id) ?? "Unknown Job",
      aiScore: s.ai_score,
      aiSummary: s.ai_summary,
      scoreBreakdown: s.score_breakdown,
      turns: s.turns as ScreeningTurn[],
      questions: config.questions,
      humanReviewRequested: s.human_review_requested,
      startedAt: s.started_at,
      completedAt: s.completed_at,
      createdAt: s.created_at,
    };
  });

  return NextResponse.json({ results });
}
