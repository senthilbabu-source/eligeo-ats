"use client";

import { useActionState, useState } from "react";
import { completeInterview, cancelInterview, markNoShow } from "@/lib/actions/interviews";
import type { InterviewStatus, InterviewType } from "@/lib/types/ground-truth";
import { formatInTz } from "@/lib/datetime";

export interface InterviewCardData {
  id: string;
  interview_type: InterviewType;
  scheduled_at: string | null;
  duration_minutes: number;
  location: string | null;
  meeting_url: string | null;
  status: InterviewStatus;
  notes: string | null;
  scorecard_template_id: string | null;
  feedback_deadline_at: string | null;
  interviewer_id: string;
  interviewer_name: string;
  created_at: string;
  has_submission: boolean;
}

interface InterviewCardProps {
  interview: InterviewCardData;
  canEdit: boolean;
  timezone: string;
  onOpenScorecard?: (interviewId: string) => void;
}

const TYPE_LABELS: Record<InterviewType, string> = {
  phone_screen: "Phone Screen",
  technical: "Technical",
  behavioral: "Behavioral",
  panel: "Panel",
  culture_fit: "Culture Fit",
  final: "Final",
  other: "Other",
};

const STATUS_STYLES: Record<InterviewStatus, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-red-100 text-red-700",
};

// formatDateTime replaced by formatInTz — timezone-aware

function isFeedbackOverdue(deadline: string | null, status: InterviewStatus): boolean {
  if (!deadline || status === "cancelled" || status === "no_show") return false;
  return new Date(deadline) < new Date();
}

export function InterviewCard({ interview, canEdit, timezone, onOpenScorecard }: InterviewCardProps) {
  const [showActions, setShowActions] = useState(false);
  const [actionState, runAction, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const action = formData.get("action") as string;
      let result: { error?: string; success?: boolean };
      if (action === "complete") result = await completeInterview(interview.id);
      else if (action === "cancel") result = await cancelInterview(interview.id);
      else if (action === "no_show") result = await markNoShow(interview.id);
      else return { error: "Unknown action" };
      setShowActions(false);
      return result;
    },
    null,
  );

  const isTerminal = interview.status === "cancelled" || interview.status === "no_show" || interview.status === "completed";
  const overdue = isFeedbackOverdue(interview.feedback_deadline_at, interview.status);

  return (
    <div className={`rounded-lg border bg-card p-4 ${isTerminal ? "opacity-60" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {TYPE_LABELS[interview.interview_type]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[interview.status]}`}>
              {interview.status.replace("_", " ")}
            </span>
            {overdue && !interview.has_submission && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Overdue
              </span>
            )}
            {interview.has_submission && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Scored
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {interview.interviewer_name} &middot; {formatInTz(interview.scheduled_at, timezone, "datetime")}
            {interview.duration_minutes ? ` (${interview.duration_minutes}m)` : ""}
          </p>
          {interview.location && (
            <p className="mt-0.5 text-xs text-muted-foreground">{interview.location}</p>
          )}
          {interview.meeting_url && (
            <a
              href={interview.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-block text-xs text-primary hover:underline"
            >
              Join meeting
            </a>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Scorecard button — visible if interview is confirmed/completed */}
          {(interview.status === "confirmed" || interview.status === "completed") && onOpenScorecard && (
            <button
              type="button"
              onClick={() => onOpenScorecard(interview.id)}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              {interview.has_submission ? "View Scorecard" : "Submit Scorecard"}
            </button>
          )}

          {/* Status actions for non-terminal interviews */}
          {canEdit && !isTerminal && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowActions(!showActions)}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                aria-label="Interview actions"
              >
                &hellip;
              </button>
              {showActions && (
                <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-md border border-border bg-card py-1 shadow-lg">
                  <form action={runAction}>
                    <input type="hidden" name="action" value="complete" />
                    <button
                      type="submit"
                      disabled={isPending}
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                    >
                      Mark Complete
                    </button>
                  </form>
                  <form action={runAction}>
                    <input type="hidden" name="action" value="no_show" />
                    <button
                      type="submit"
                      disabled={isPending}
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                    >
                      Mark No-Show
                    </button>
                  </form>
                  <form action={runAction}>
                    <input type="hidden" name="action" value="cancel" />
                    <button
                      type="submit"
                      disabled={isPending}
                      className="block w-full px-3 py-1.5 text-left text-xs text-destructive hover:bg-muted disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {actionState && "error" in actionState && (
        <p className="mt-2 text-xs text-destructive">{actionState.error}</p>
      )}
    </div>
  );
}
