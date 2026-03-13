"use client";

import { useState } from "react";
import type { ScreeningQuestion, ScreeningTurn } from "@/lib/types/ground-truth";

interface Props {
  turns: ScreeningTurn[];
  questions: ScreeningQuestion[];
}

/**
 * D32 §7.6 — Expandable screening transcript.
 */
export function ScreeningTranscript({ turns, questions }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="px-4 py-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <span>Full Transcript ({turns.length} questions)</span>
        <span>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-4">
          {turns.map((turn) => {
            const q = questions.find((q) => q.id === turn.question_id);
            return (
              <div key={turn.id} className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-primary">{q?.topic ?? "Question"}</p>
                  <p className="mt-0.5 text-sm font-medium">{turn.ai_question_text}</p>
                </div>
                <div className="ml-4 rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-sm">{turn.candidate_answer}</p>
                </div>
                {turn.ai_follow_up && (
                  <>
                    <div>
                      <p className="text-xs font-medium text-amber-600">Follow-up</p>
                      <p className="mt-0.5 text-sm">{turn.ai_follow_up}</p>
                    </div>
                    {turn.candidate_follow_up_answer && (
                      <div className="ml-4 rounded-md bg-muted/50 px-3 py-2">
                        <p className="text-sm">{turn.candidate_follow_up_answer}</p>
                      </div>
                    )}
                  </>
                )}
                {turn.turn_score !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Score: {Math.round(turn.turn_score * 100)}%
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
