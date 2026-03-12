"use client";

import { useState } from "react";
import { InterviewCard, type InterviewCardData } from "./interview-card";
import { ScheduleInterviewModal } from "./schedule-interview-modal";
import { ScorecardPanel } from "./scorecard-panel";

interface InterviewListProps {
  applicationId: string;
  interviews: InterviewCardData[];
  canCreate: boolean;
  canEdit: boolean;
  canSubmitScorecard: boolean;
  currentUserId: string;
  interviewers: Array<{ id: string; full_name: string }>;
  templates: Array<{ id: string; name: string }>;
}

export function InterviewList({
  applicationId,
  interviews,
  canCreate,
  canEdit,
  canSubmitScorecard,
  currentUserId,
  interviewers,
  templates,
}: InterviewListProps) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [scorecardInterviewId, setScorecardInterviewId] = useState<string | null>(null);

  const scorecardInterview = scorecardInterviewId
    ? interviews.find((i) => i.id === scorecardInterviewId)
    : null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Interviews ({interviews.length})
        </h3>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowSchedule(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Schedule
          </button>
        )}
      </div>

      {interviews.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No interviews scheduled.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {interviews.map((interview) => (
            <InterviewCard
              key={interview.id}
              interview={interview}
              canEdit={canEdit}
              onOpenScorecard={
                canSubmitScorecard || canEdit
                  ? (id) => setScorecardInterviewId(id)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {showSchedule && (
        <ScheduleInterviewModal
          applicationId={applicationId}
          interviewers={interviewers}
          templates={templates}
          onClose={() => setShowSchedule(false)}
        />
      )}

      {scorecardInterview && (
        <ScorecardPanel
          interviewId={scorecardInterview.id}
          applicationId={applicationId}
          scorecardTemplateId={scorecardInterview.scorecard_template_id}
          hasSubmission={scorecardInterview.has_submission}
          currentUserId={currentUserId}
          onClose={() => setScorecardInterviewId(null)}
        />
      )}
    </div>
  );
}
