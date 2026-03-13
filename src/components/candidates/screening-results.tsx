import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import type { ScreeningQuestion, ScreeningTurn, ScoreBreakdown } from "@/lib/types/ground-truth";
import { ScreeningTranscript } from "./screening-transcript";

interface Props {
  candidateId: string;
}

/**
 * D32 §7.6 — Screening results card for the candidate profile.
 * Shows score badge, AI summary, per-question breakdown.
 */
export async function ScreeningResultsCard({ candidateId }: Props) {
  const session = await requireAuth();
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("screening_sessions")
    .select("*, screening_configs!inner(job_opening_id, questions)")
    .eq("organization_id", session.orgId)
    .eq("candidate_id", candidateId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (!sessions || sessions.length === 0) return null;

  // Fetch job titles
  const jobIds = [
    ...new Set(
      sessions.map(
        (s) => (s.screening_configs as unknown as { job_opening_id: string }).job_opening_id,
      ),
    ),
  ];
  const { data: jobs } = await supabase
    .from("job_openings")
    .select("id, title")
    .in("id", jobIds);
  const jobMap = new Map((jobs ?? []).map((j) => [j.id, j.title]));

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">AI Screening Results</h3>
      {sessions.map((s) => {
        const config = s.screening_configs as unknown as {
          job_opening_id: string;
          questions: ScreeningQuestion[];
        };
        const score = s.ai_score as number | null;
        const scoreColor =
          score === null
            ? "bg-muted text-muted-foreground"
            : score >= 0.75
              ? "bg-green-100 text-green-700"
              : score >= 0.5
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700";

        return (
          <div key={s.id} className="rounded-lg border border-border bg-card">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {jobMap.get(config.job_opening_id) ?? "Unknown Job"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.status === "completed"
                    ? `Completed ${new Date(s.completed_at).toLocaleDateString()}`
                    : `Status: ${s.status}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {s.human_review_requested && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Human review requested
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${scoreColor}`}>
                  {score !== null ? `${Math.round(score * 100)}%` : s.status}
                </span>
              </div>
            </div>

            {/* Summary */}
            {s.ai_summary && (
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm">{s.ai_summary}</p>
              </div>
            )}

            {/* Score breakdown */}
            {s.score_breakdown && s.status === "completed" && (
              <div className="border-b border-border px-4 py-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Score Breakdown</p>
                <div className="space-y-1.5">
                  {config.questions.map((q) => {
                    const breakdown = s.score_breakdown as ScoreBreakdown;
                    const qScore = breakdown[q.id];
                    if (qScore === undefined) return null;
                    return (
                      <div key={q.id} className="flex items-center gap-2">
                        <span className="w-32 truncate text-xs text-muted-foreground">
                          {q.topic}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary transition-all"
                            style={{ width: `${qScore * 100}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-medium">
                          {Math.round(qScore * 100)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Transcript (expandable) */}
            {(s.turns as ScreeningTurn[]).length > 0 && (
              <ScreeningTranscript
                turns={s.turns as ScreeningTurn[]}
                questions={config.questions}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
