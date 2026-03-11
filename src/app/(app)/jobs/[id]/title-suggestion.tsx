"use client";

import { useEffect, useState, useTransition } from "react";
import { getJobTitleSuggestion, applyTitleSuggestion } from "@/lib/actions/jobs";
import type { CloneIntent } from "@/lib/types/ground-truth";

interface Props {
  jobId: string;
  currentTitle: string;
  cloneIntent: CloneIntent; // used by parent to gate rendering; kept for future intent-aware display
  canEdit: boolean;
}

export function TitleSuggestionBadge({ jobId, currentTitle, cloneIntent: _cloneIntent, canEdit }: Props) {
  const [suggestion, setSuggestion] = useState<{
    suggestedTitle: string;
    reason: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isApplying, startApply] = useTransition();

  useEffect(() => {
    getJobTitleSuggestion(jobId).then((result) => {
      if (
        !result.error &&
        result.suggestedTitle &&
        result.suggestedTitle !== currentTitle
      ) {
        setSuggestion({ suggestedTitle: result.suggestedTitle, reason: result.reason ?? "" });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (!suggestion || dismissed || !canEdit) return null;

  return (
    <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-primary">AI title suggestion</p>
        <p className="mt-0.5 text-sm font-medium">&ldquo;{suggestion.suggestedTitle}&rdquo;</p>
        {suggestion.reason && (
          <p className="mt-0.5 text-xs text-muted-foreground">{suggestion.reason}</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() =>
            startApply(async () => {
              await applyTitleSuggestion(jobId, suggestion.suggestedTitle);
              setDismissed(true);
            })
          }
          disabled={isApplying}
          className="inline-flex h-7 items-center rounded border border-primary px-2 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
        >
          {isApplying ? "Applying…" : "Apply"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex h-7 items-center rounded border border-border px-2 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
