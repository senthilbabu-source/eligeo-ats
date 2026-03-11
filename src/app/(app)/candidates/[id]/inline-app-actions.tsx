"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveStage, rejectApplication } from "@/lib/actions/candidates";

interface Props {
  applicationId: string;
  nextStageId: string | null;
  isActive: boolean;
}

export function InlineAppActions({ applicationId, nextStageId, isActive }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!isActive) return null;

  function handleAdvance() {
    if (!nextStageId) return;
    startTransition(async () => {
      await moveStage(applicationId, nextStageId!);
      router.refresh();
    });
  }

  function handleReject() {
    startTransition(async () => {
      await rejectApplication(applicationId);
      router.refresh();
    });
  }

  return (
    <div className="mt-2 flex gap-2">
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
        onClick={handleReject}
        className="rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-40"
      >
        Reject
      </button>
    </div>
  );
}
