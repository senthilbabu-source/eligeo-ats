"use client";

import { useTransition } from "react";
import { useCompletion } from "@ai-sdk/react";
import { acceptJobRewrite, revertJobDescription } from "@/lib/actions/jobs";

interface Props {
  jobId: string;
  description: string | null;
  descriptionPrevious: string | null;
  canEdit: boolean;
}

export function RewritePanel({
  jobId,
  description,
  descriptionPrevious,
  canEdit,
}: Props) {
  const [isAccepting, startAccept] = useTransition();
  const [isReverting, startRevert] = useTransition();

  const { completion, isLoading, complete, stop, setCompletion } = useCompletion({
    api: `/api/jobs/${jobId}/rewrite`,
    onError() {
      // completion stays empty — user sees the trigger button again
    },
  });

  if (!canEdit) return null;

  const isStreaming = isLoading;
  const hasCompletion = completion.length > 0;

  function handleDiscard() {
    setCompletion("");
  }

  function handleAccept() {
    startAccept(async () => {
      await acceptJobRewrite(jobId, completion);
      setCompletion("");
    });
  }

  function handleRevert() {
    startRevert(async () => {
      await revertJobDescription(jobId);
    });
  }

  return (
    <div className="mt-8 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">AI Rewrite</h2>
        <div className="flex gap-2">
          {descriptionPrevious && !hasCompletion && !isStreaming && (
            <button
              type="button"
              onClick={handleRevert}
              disabled={isReverting}
              className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              {isReverting ? "Reverting…" : "Revert to previous"}
            </button>
          )}
          {!isStreaming && !hasCompletion && (
            <button
              type="button"
              onClick={() => complete("", { body: {} })}
              className="inline-flex h-9 items-center rounded-md border border-primary/30 bg-primary/5 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              title="✦ AI Rewrite (3 credits)"
            >
              ✦ AI Rewrite
            </button>
          )}
          {isStreaming && (
            <button
              type="button"
              onClick={stop}
              className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {(isStreaming || hasCompletion) && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Original
              </p>
              <div className="max-h-96 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                {description || "No description"}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-primary">
                AI Rewrite{isStreaming ? " …" : ""}
              </p>
              <div className="max-h-96 overflow-y-auto rounded-md border border-primary/20 bg-primary/5 p-3 text-sm whitespace-pre-wrap">
                {completion}
              </div>
            </div>
          </div>

          {!isStreaming && (
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={isAccepting}
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isAccepting ? "Saving…" : "Accept"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
