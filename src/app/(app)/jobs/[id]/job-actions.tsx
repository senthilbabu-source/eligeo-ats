"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishJob, closeJob, cloneJob } from "@/lib/actions/jobs";
import { CloneIntentModal } from "@/components/clone-intent-modal";
import type { CloneIntent } from "@/lib/types/ground-truth";

export function JobActions({
  jobId,
  status,
  canEdit,
  canCreate,
}: {
  jobId: string;
  status: string;
  canEdit: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [isCloning, startClone] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);

  function handleCloneConfirm(intent: CloneIntent | null) {
    startClone(async () => {
      const result = await cloneJob(jobId, intent);
      if (result.success && result.id) {
        setModalOpen(false);
        router.push(`/jobs/${result.id}`);
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canEdit && (status === "draft" || status === "paused") && (
          <button
            onClick={() => publishJob(jobId)}
            className="inline-flex h-9 items-center rounded-md bg-success px-4 text-sm font-medium text-white hover:bg-success/90"
          >
            Publish
          </button>
        )}
        {canEdit && (status === "open" || status === "paused") && (
          <button
            onClick={() => closeJob(jobId)}
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            Close
          </button>
        )}
        {canCreate && (
          <button
            onClick={() => setModalOpen(true)}
            disabled={isCloning}
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isCloning ? "Cloning…" : "Clone"}
          </button>
        )}
      </div>

      <CloneIntentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleCloneConfirm}
        isPending={isCloning}
      />
    </>
  );
}
