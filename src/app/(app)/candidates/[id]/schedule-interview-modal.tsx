"use client";

import { useActionState, useState } from "react";
import { createInterview } from "@/lib/actions/interviews";
import type { InterviewType } from "@/lib/types/ground-truth";

interface ScheduleInterviewModalProps {
  applicationId: string;
  interviewers: Array<{ id: string; full_name: string }>;
  templates: Array<{ id: string; name: string }>;
  timezone: string;
  onClose: () => void;
}

const INTERVIEW_TYPES: { value: InterviewType; label: string }[] = [
  { value: "phone_screen", label: "Phone Screen" },
  { value: "technical", label: "Technical" },
  { value: "behavioral", label: "Behavioral" },
  { value: "panel", label: "Panel" },
  { value: "culture_fit", label: "Culture Fit" },
  { value: "final", label: "Final" },
  { value: "other", label: "Other" },
];

export function ScheduleInterviewModal({
  applicationId,
  interviewers,
  templates,
  timezone,
  onClose,
}: ScheduleInterviewModalProps) {
  const [state, action, isPending] = useActionState(createInterview, null);
  const [interviewType, setInterviewType] = useState<InterviewType>("phone_screen");

  // Close on success
  if (state && "success" in state && state.success) {
    // Use setTimeout to avoid setState during render
    setTimeout(() => onClose(), 0);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Schedule Interview</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <form action={action} className="mt-4 space-y-4">
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="timezone" value={timezone} />

          {/* Interviewer */}
          <div>
            <label htmlFor="interviewerId" className="block text-sm font-medium">
              Interviewer
            </label>
            <select
              id="interviewerId"
              name="interviewerId"
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select interviewer...</option>
              {interviewers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Interview Type */}
          <div>
            <label htmlFor="interviewType" className="block text-sm font-medium">
              Type
            </label>
            <select
              id="interviewType"
              name="interviewType"
              required
              value={interviewType}
              onChange={(e) => setInterviewType(e.target.value as InterviewType)}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {INTERVIEW_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="scheduledAt" className="block text-sm font-medium">
                Date & Time
                <span className="ml-1 text-xs font-normal text-muted-foreground">({timezone})</span>
              </label>
              <input
                id="scheduledAt"
                name="scheduledAt"
                type="datetime-local"
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="durationMinutes" className="block text-sm font-medium">
                Duration (min)
              </label>
              <input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                min={15}
                max={480}
                defaultValue={60}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Location / Meeting URL */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="location" className="block text-sm font-medium">
                Location
              </label>
              <input
                id="location"
                name="location"
                type="text"
                placeholder="Office, Room 3..."
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="meetingUrl" className="block text-sm font-medium">
                Meeting URL
              </label>
              <input
                id="meetingUrl"
                name="meetingUrl"
                type="url"
                placeholder="https://meet.google.com/..."
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Scorecard Template */}
          {templates.length > 0 && (
            <div>
              <label htmlFor="scorecardTemplateId" className="block text-sm font-medium">
                Scorecard Template
              </label>
              <select
                id="scorecardTemplateId"
                name="scorecardTemplateId"
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">None</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Feedback Deadline */}
          <div>
            <label htmlFor="feedbackDeadlineAt" className="block text-sm font-medium">
              Feedback Deadline
              <span className="ml-1 text-xs font-normal text-muted-foreground">({timezone})</span>
            </label>
            <input
              id="feedbackDeadlineAt"
              name="feedbackDeadlineAt"
              type="datetime-local"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              maxLength={2000}
              placeholder="Interview focus areas, preparation notes..."
              className="mt-1 block w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {state && "error" in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Scheduling..." : "Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
