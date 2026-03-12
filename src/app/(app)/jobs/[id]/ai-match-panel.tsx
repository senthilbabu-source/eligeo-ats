"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { aiMatchCandidates, aiGenerateJobEmbedding, submitScoreFeedback } from "@/lib/actions/ai";

interface AiMatchPanelProps {
  jobId: string;
  hasEmbedding: boolean;
  /** AF2 — null means embedding was never (re-)generated after tracking began */
  embeddingUpdatedAt: string | null;
}

interface MatchResult {
  candidate_id: string;
  full_name: string;
  email: string;
  current_title: string | null;
  skills: string[];
  similarity_score: number;
}

type FeedbackSignal = "thumbs_up" | "thumbs_down";

/** AF2 — stale when embedding_updated_at is null or older than 7 days */
export function isEmbeddingStale(embeddingUpdatedAt: string | null, nowMs?: number): boolean {
  if (!embeddingUpdatedAt) return false; // never tracked — no signal to show
  const updatedMs = new Date(embeddingUpdatedAt).getTime();
  const now = nowMs ?? Date.now();
  return now - updatedMs > 7 * 24 * 60 * 60 * 1000;
}

export function AiMatchPanel({ jobId, hasEmbedding, embeddingUpdatedAt }: AiMatchPanelProps) {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();
  // AF1 — feedback state keyed by candidateId
  const [feedback, setFeedback] = useState<Record<string, FeedbackSignal>>({});
  const [feedbackPending, setFeedbackPending] = useState<Record<string, boolean>>({});
  const [feedbackError, setFeedbackError] = useState<Record<string, string>>({});

  function handleFindMatches() {
    startTransition(async () => {
      setError(null);
      const result = await aiMatchCandidates(jobId);
      if ("error" in result && result.error) {
        setError(result.error);
      } else if ("matches" in result) {
        setMatches(result.matches);
        setCreditsRemaining(result.creditsRemaining ?? null);
      }
      setHasSearched(true);
    });
  }

  function handleGenerateEmbedding() {
    startGenerating(async () => {
      setError(null);
      const result = await aiGenerateJobEmbedding(jobId);
      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        // Embedding generated — now find matches
        handleFindMatches();
      }
    });
  }

  async function handleFeedback(
    candidateId: string,
    signal: FeedbackSignal,
    matchScore: number,
  ) {
    // Toggle off if same signal already set
    if (feedback[candidateId] === signal) {
      setFeedback((prev) => {
        const next = { ...prev };
        delete next[candidateId];
        return next;
      });
      return;
    }

    // Optimistic update
    setFeedback((prev) => ({ ...prev, [candidateId]: signal }));
    setFeedbackPending((prev) => ({ ...prev, [candidateId]: true }));
    setFeedbackError((prev) => {
      const next = { ...prev };
      delete next[candidateId];
      return next;
    });

    const result = await submitScoreFeedback({
      candidateId,
      jobId,
      signal,
      matchScoreAtTime: Math.round(matchScore * 100),
    });

    setFeedbackPending((prev) => ({ ...prev, [candidateId]: false }));

    if ("error" in result) {
      // Revert optimistic update
      setFeedback((prev) => {
        const next = { ...prev };
        delete next[candidateId];
        return next;
      });
      const msg =
        result.error === "no_application"
          ? "Add candidate to pipeline first"
          : result.error;
      setFeedbackError((prev) => ({ ...prev, [candidateId]: msg }));
    }
  }

  const stale = hasEmbedding && isEmbeddingStale(embeddingUpdatedAt);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">AI Candidate Matches</h2>
          {/* AF2 — staleness badge */}
          {stale && (
            <span
              title="Job description or skills were updated since the last embedding. Scores may be outdated — regenerate to refresh."
              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            >
              ⚠ Scores may be outdated
            </span>
          )}
        </div>
        {creditsRemaining !== null && (
          <span className="text-xs text-muted-foreground">
            {creditsRemaining} credits remaining
          </span>
        )}
      </div>

      {!hasEmbedding ? (
        <div className="mt-3 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Generate an AI embedding for this job to find matching candidates.
          </p>
          <button
            onClick={handleGenerateEmbedding}
            disabled={isGenerating}
            className="mt-3 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Generate Embedding & Find Matches"}
          </button>
        </div>
      ) : (
        <>
          {!hasSearched && (
            <button
              onClick={handleFindMatches}
              disabled={isPending}
              className="mt-3 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Searching..." : "Find AI Matches"}
            </button>
          )}
        </>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {hasSearched && matches.length > 0 && (
        <div className="mt-4 space-y-2">
          {matches.map((match) => (
            <div key={match.candidate_id} className="relative">
              <Link
                href={`/candidates/${match.candidate_id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{match.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {match.current_title ?? match.email}
                  </p>
                  {match.skills?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {match.skills.slice(0, 5).map((skill) => (
                        <span
                          key={skill}
                          className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ml-4 text-right">
                  <div className="text-lg font-semibold text-primary">
                    {Math.round(match.similarity_score * 100)}%
                  </div>
                  <p className="text-xs text-muted-foreground">match</p>
                </div>
              </Link>

              {/* AF1 — score feedback buttons */}
              <div className="absolute bottom-3 right-16 flex items-center gap-1">
                {feedbackError[match.candidate_id] && (
                  <span className="mr-1 text-xs text-muted-foreground">
                    {feedbackError[match.candidate_id]}
                  </span>
                )}
                <button
                  type="button"
                  disabled={feedbackPending[match.candidate_id]}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleFeedback(match.candidate_id, "thumbs_up", match.similarity_score);
                  }}
                  title="Good match"
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors disabled:opacity-40 ${
                    feedback[match.candidate_id] === "thumbs_up"
                      ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  👍
                </button>
                <button
                  type="button"
                  disabled={feedbackPending[match.candidate_id]}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleFeedback(match.candidate_id, "thumbs_down", match.similarity_score);
                  }}
                  title="Poor match"
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors disabled:opacity-40 ${
                    feedback[match.candidate_id] === "thumbs_down"
                      ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  👎
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasSearched && matches.length === 0 && !error && (
        <p className="mt-4 text-sm text-muted-foreground">
          No matching candidates found. Try adding more candidates with
          embeddings or lower the similarity threshold.
        </p>
      )}
    </div>
  );
}
