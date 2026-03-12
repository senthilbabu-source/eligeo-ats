"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveStage, rejectApplication } from "@/lib/actions/candidates";

interface RejectionReason {
  id: string;
  name: string;
}

interface Props {
  applicationId: string;
  nextStageId: string | null;
  isActive: boolean;
  rejectionReasons?: RejectionReason[];
}

export function InlineAppActions({ applicationId, nextStageId, isActive, rejectionReasons = [] }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showRejectPanel, setShowRejectPanel] = useState(false);
  const [selectedReasonId, setSelectedReasonId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const router = useRouter();

  if (!isActive) return null;

  function handleAdvance() {
    if (!nextStageId) return;
    startTransition(async () => {
      await moveStage(applicationId, nextStageId!);
      router.refresh();
    });
  }

  function handleRejectClick() {
    if (rejectionReasons.length === 0) {
      // No reasons configured — reject directly (fallback)
      startTransition(async () => {
        await rejectApplication(applicationId);
        router.refresh();
      });
    } else {
      setShowRejectPanel((v) => !v);
    }
  }

  function handleConfirmReject() {
    startTransition(async () => {
      await rejectApplication(
        applicationId,
        selectedReasonId || undefined,
        notes.trim() || undefined,
      );
      setShowRejectPanel(false);
      setSelectedReasonId("");
      setNotes("");
      router.refresh();
    });
  }

  function handleCancelReject() {
    setShowRejectPanel(false);
    setSelectedReasonId("");
    setNotes("");
  }

  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || !nextStageId}
          onClick={handleAdvance}
          className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
          title={nextStageId ? "Advance to next stage" : "Already at last stage"}
        >
          Advance →
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleRejectClick}
          className="rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-40"
        >
          Reject
        </button>
      </div>

      {/* CP9 — Rejection reason picker */}
      {showRejectPanel && rejectionReasons.length > 0 && (
        <div className="mt-2 rounded-lg border border-border bg-card p-3 shadow-md">
          <p className="text-xs font-medium text-foreground">Rejection reason</p>

          <div className="mt-2 space-y-1">
            {rejectionReasons.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
              >
                <input
                  type="radio"
                  name={`reject-reason-${applicationId}`}
                  value={r.id}
                  checked={selectedReasonId === r.id}
                  onChange={() => setSelectedReasonId(r.id)}
                  className="accent-destructive"
                />
                <span className="text-xs">{r.name}</span>
              </label>
            ))}
          </div>

          <div className="mt-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-destructive/60 focus:ring-1 focus:ring-destructive/20"
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancelReject}
              disabled={isPending}
              className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmReject}
              disabled={isPending}
              className="rounded-md bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
            >
              {isPending ? "Rejecting…" : "Confirm Reject"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
