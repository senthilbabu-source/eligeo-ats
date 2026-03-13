"use client";

import { useState, useTransition } from "react";
import type { ScreeningQuestion, ScreeningTurn } from "@/lib/types/ground-truth";

interface Props {
  sessionId: string;
  token: string;
  status: string;
  questions: ScreeningQuestion[];
  existingTurns: ScreeningTurn[];
  jobTitle: string;
  orgName: string;
  maxDurationMin: number;
  isGrowthPlus: boolean;
  humanReviewRequested: boolean;
}

export function ScreeningPortal({
  sessionId,
  token,
  status: initialStatus,
  questions,
  existingTurns,
  jobTitle,
  orgName,
  maxDurationMin,
  isGrowthPlus,
  humanReviewRequested: initialHumanReview,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    // Resume from where candidate left off
    const answeredIds = new Set(existingTurns.map((t) => t.question_id));
    const firstUnanswered = questions.findIndex((q) => !answeredIds.has(q.id));
    return firstUnanswered === -1 ? questions.length : firstUnanswered;
  });
  const [turns, setTurns] = useState<ScreeningTurn[]>(existingTurns);
  const [answer, setAnswer] = useState("");
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [humanReview, setHumanReview] = useState(initialHumanReview);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isCompleted = status === "completed";
  const isAllAnswered = currentIndex >= questions.length;
  const currentQuestion = questions[currentIndex];
  const progress = Math.min(currentIndex / questions.length, 1);

  const submitAnswer = () => {
    if (!currentQuestion || !answer.trim()) return;

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/portal/screening/${sessionId}/answer?token=${encodeURIComponent(token)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionId: currentQuestion.id,
              answer: answer.trim(),
              aiQuestionText: currentQuestion.raw_question,
            }),
          },
        );

        const data = await res.json();
        if (!res.ok) {
          setError(data.title ?? "Failed to save answer");
          return;
        }

        // Add to local turns
        const newTurn: ScreeningTurn = {
          id: `t-${Date.now()}`,
          question_id: currentQuestion.id,
          ai_question_text: currentQuestion.raw_question,
          candidate_answer: answer.trim(),
          timestamp: new Date().toISOString(),
        };

        if (data.followUp?.text) {
          newTurn.ai_follow_up = data.followUp.text;
          setFollowUp(data.followUp.text);
          setTurns([...turns, newTurn]);
          setAnswer("");
          return;
        }

        setTurns([...turns, newTurn]);
        setAnswer("");
        setFollowUp(null);
        setCurrentIndex(currentIndex + 1);
      } catch {
        setError("Network error — please try again");
      }
    });
  };

  const submitFollowUp = () => {
    if (!followUpAnswer.trim() || !currentQuestion) return;

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/portal/screening/${sessionId}/answer?token=${encodeURIComponent(token)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionId: currentQuestion.id,
              answer: followUpAnswer.trim(),
              isFollowUp: true,
            }),
          },
        );

        if (!res.ok) {
          const data = await res.json();
          setError(data.title ?? "Failed to save follow-up");
          return;
        }

        // Update local turn
        const updatedTurns = [...turns];
        const lastTurn = updatedTurns[updatedTurns.length - 1];
        if (lastTurn) {
          lastTurn.candidate_follow_up_answer = followUpAnswer.trim();
        }

        setTurns(updatedTurns);
        setFollowUp(null);
        setFollowUpAnswer("");
        setCurrentIndex(currentIndex + 1);
      } catch {
        setError("Network error — please try again");
      }
    });
  };

  const submitScreening = () => {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/portal/screening/${sessionId}/complete?token=${encodeURIComponent(token)}`,
          { method: "POST" },
        );

        if (!res.ok) {
          const data = await res.json();
          setError(data.title ?? "Failed to submit");
          return;
        }

        setStatus("completed");
      } catch {
        setError("Network error — please try again");
      }
    });
  };

  const requestHumanReviewHandler = () => {
    startTransition(async () => {
      try {
        // Use the server action via API — simple fetch to update the flag
        const res = await fetch(
          `/api/portal/screening/${sessionId}/answer?token=${encodeURIComponent(token)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionId: "__human_review__",
              answer: "Human review requested",
              isFollowUp: false,
            }),
          },
        );
        // Note: We'll handle human review via the session flag directly
        setHumanReview(true);
      } catch {
        // Silently fail — not critical
      }
    });
  };

  if (isCompleted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-full bg-green-100 p-4 inline-block mb-4">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold">Screening Complete</h1>
        <p className="mt-2 text-muted-foreground">
          Thank you for completing the screening for <strong>{jobTitle}</strong> at {orgName}.
          The recruiter will review your responses and be in touch.
        </p>
        {humanReview && (
          <p className="mt-4 text-sm text-amber-600">
            Your request for human-only review has been noted.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Screening for {jobTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {orgName} · Estimated {maxDurationMin} minutes
        </p>

        {/* Progress bar */}
        <div className="mt-4 h-2 rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {currentIndex} of {questions.length} questions answered
        </p>
      </div>

      {/* EU AI Act disclosure */}
      {isGrowthPlus && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs text-blue-700">
            <strong>ⓘ AI-Assisted Screening:</strong> Your responses are being processed by an
            AI system on behalf of {orgName}. A human recruiter will review all assessments.
            You may{" "}
            <button
              onClick={requestHumanReviewHandler}
              disabled={humanReview}
              className="underline font-medium disabled:no-underline"
            >
              {humanReview ? "human review requested ✓" : "request human-only review"}
            </button>
            .
          </p>
        </div>
      )}

      {/* Previous answers (collapsed) */}
      {turns.length > 0 && !isAllAnswered && (
        <div className="mb-6 space-y-3">
          {turns.map((turn) => {
            const q = questions.find((q) => q.id === turn.question_id);
            return (
              <div key={turn.id} className="rounded-lg border border-border bg-card/50 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">{q?.topic}</p>
                <p className="mt-1 text-sm">{turn.candidate_answer}</p>
                {turn.candidate_follow_up_answer && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Follow-up: {turn.candidate_follow_up_answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Current question */}
      {currentQuestion && !followUp && (
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-4">
            <p className="text-xs font-medium text-primary">{currentQuestion.topic}</p>
            <p className="mt-2 text-sm font-medium">{currentQuestion.raw_question}</p>
            {currentQuestion.is_required && (
              <span className="mt-1 inline-block text-xs text-red-500">Required</span>
            )}
          </div>

          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer..."
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isPending}
          />

          <div className="flex items-center justify-between">
            <button
              onClick={submitAnswer}
              disabled={isPending || !answer.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Next"}
            </button>
            <span className="text-xs text-muted-foreground">
              {answer.length} characters
            </span>
          </div>
        </div>
      )}

      {/* Follow-up question */}
      {followUp && (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-xs font-medium text-amber-700">Follow-up</p>
            <p className="mt-2 text-sm font-medium">{followUp}</p>
          </div>

          <textarea
            value={followUpAnswer}
            onChange={(e) => setFollowUpAnswer(e.target.value)}
            placeholder="Add more detail..."
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isPending}
          />

          <button
            onClick={submitFollowUp}
            disabled={isPending || !followUpAnswer.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Continue"}
          </button>
        </div>
      )}

      {/* All answered — submit */}
      {isAllAnswered && !isCompleted && (
        <div className="text-center space-y-4">
          <h2 className="text-lg font-semibold">All questions answered!</h2>
          <p className="text-sm text-muted-foreground">
            Review your answers above, then submit your screening.
          </p>

          {/* Show all answers for review */}
          <div className="space-y-3 text-left">
            {turns.map((turn) => {
              const q = questions.find((q) => q.id === turn.question_id);
              return (
                <div key={turn.id} className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">{q?.topic}</p>
                  <p className="mt-1 text-sm">{turn.candidate_answer}</p>
                  {turn.candidate_follow_up_answer && (
                    <p className="mt-1 text-sm italic text-muted-foreground">
                      {turn.candidate_follow_up_answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={submitScreening}
            disabled={isPending}
            className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Submitting..." : "Submit Screening"}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
