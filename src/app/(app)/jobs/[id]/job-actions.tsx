"use client";

import { publishJob, closeJob } from "@/lib/actions/jobs";

export function JobActions({
  jobId,
  status,
}: {
  jobId: string;
  status: string;
}) {
  return (
    <div className="flex gap-2">
      {(status === "draft" || status === "paused") && (
        <button
          onClick={() => publishJob(jobId)}
          className="inline-flex h-9 items-center rounded-md bg-success px-4 text-sm font-medium text-white hover:bg-success/90"
        >
          Publish
        </button>
      )}
      {(status === "open" || status === "paused") && (
        <button
          onClick={() => closeJob(jobId)}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
        >
          Close
        </button>
      )}
    </div>
  );
}
