"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishJob, closeJob, cloneJob, rewriteJobDescription } from "@/lib/actions/jobs";

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
  const [isRewriting, startRewrite] = useTransition();

  function handleClone() {
    startClone(async () => {
      const result = await cloneJob(jobId);
      if (result.success && result.id) {
        router.push(`/jobs/${result.id}`);
      }
    });
  }

  function handleRewrite() {
    startRewrite(async () => {
      await rewriteJobDescription(jobId);
      router.refresh();
    });
  }

  return (
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
          onClick={handleClone}
          disabled={isCloning}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isCloning ? "Cloning…" : "Clone"}
        </button>
      )}
      {canEdit && (
        <button
          onClick={handleRewrite}
          disabled={isRewriting}
          className="inline-flex h-9 items-center rounded-md border border-primary/30 bg-primary/5 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          title="AI rewrites the job description"
        >
          {isRewriting ? "Rewriting…" : "✦ AI Rewrite"}
        </button>
      )}
    </div>
  );
}
