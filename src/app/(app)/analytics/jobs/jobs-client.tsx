"use client";

import Link from "next/link";
import { AiNarrativeCard } from "@/components/analytics/ai-narrative-card";
import type { JobSnapshot } from "@/lib/analytics/compute";

function healthColor(score: number): string {
  if (score >= 0.7) return "text-success border-success/30 bg-success/10";
  if (score >= 0.4) return "text-amber-600 border-amber-300 bg-amber-100 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-900/30";
  return "text-destructive border-destructive/30 bg-destructive/10";
}

export function JobsClient({
  jobs,
  orgContext,
}: {
  jobs: JobSnapshot;
  orgContext: { totalOpenJobs: number; teamSize: number; avgTimeToHire: number };
}) {
  return (
    <>
      <div className="mt-6">
        <AiNarrativeCard
          view="jobs"
          currentPeriod={jobs}
          previousPeriod={null}
          orgContext={orgContext}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Open Jobs ({jobs.jobs.length})
        </h2>

        {jobs.jobs.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No open jobs to analyze.
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.jobs.map((job) => (
              <div
                key={job.jobId}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    {/* Health score indicator */}
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums ${healthColor(job.healthScore)}`}
                    >
                      {Math.round(job.healthScore * 100)}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/jobs/${job.jobId}`}
                        className="text-sm font-medium hover:text-primary"
                      >
                        {job.title}
                      </Link>
                      {job.department && (
                        <span className="ml-2 text-xs text-muted-foreground">{job.department}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-6 text-xs text-muted-foreground">
                  <div className="text-right">
                    <p className="font-medium tabular-nums">{job.daysOpen}d</p>
                    <p>open</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums">{job.applicationCount} → {job.activeCount}</p>
                    <p>apps → active</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums">{job.offerCount}</p>
                    <p>offers</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums">
                      {job.predictedFillDays !== null ? `${job.predictedFillDays}d` : "—"}
                    </p>
                    <p>predicted</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
