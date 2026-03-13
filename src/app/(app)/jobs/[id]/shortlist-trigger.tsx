"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * D32 §17 — ShortlistTriggerButton.
 * Shows "AI Shortlist" button on job detail page.
 * Polls for completion, then navigates to report page.
 */
export function ShortlistTriggerButton({
  jobId,
  hasApplications,
  lastReportId,
  lastReportStatus,
  lastReportCompletedAt,
  lastReportShortlistCount,
  canEdit,
}: {
  jobId: string;
  hasApplications: boolean;
  lastReportId: string | null;
  lastReportStatus: string | null;
  lastReportCompletedAt: string | null;
  lastReportShortlistCount: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [triggering, setTriggering] = useState(false);
  const [polling, setPolling] = useState(false);

  const poll = useCallback(async (reportId: string) => {
    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/shortlist/latest`);
        const data = await res.json();
        if (data.report?.status === "complete") {
          clearInterval(interval);
          setPolling(false);
          router.push(`/jobs/${jobId}/shortlist-report/${reportId}`);
        } else if (data.report?.status === "failed") {
          clearInterval(interval);
          setPolling(false);
          // Report failed — stop polling
        }
      } catch {
        clearInterval(interval);
        setPolling(false);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, router]);

  async function handleTrigger() {
    setTriggering(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/shortlist`, { method: "POST" });
      const data = await res.json();
      if (data.reportId) {
        if (data.existing && data.status !== "pending" && data.status !== "processing") {
          router.push(`/jobs/${jobId}/shortlist-report/${data.reportId}`);
        } else {
          poll(data.reportId);
        }
      }
    } catch {
      // Silent fail
    }
    setTriggering(false);
  }

  if (!canEdit) return null;

  const isProcessing = polling || triggering;
  const hasReport = lastReportId && lastReportStatus === "complete";
  const timeAgo = lastReportCompletedAt
    ? formatTimeAgo(new Date(lastReportCompletedAt))
    : null;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleTrigger}
        disabled={!hasApplications || isProcessing}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
        title={!hasApplications ? "No applications yet" : undefined}
      >
        {isProcessing ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Analyzing resumes...
          </>
        ) : hasReport ? (
          "Rerun AI Shortlist"
        ) : (
          "AI Shortlist All Applicants"
        )}
      </button>

      {hasReport && !isProcessing && (
        <button
          onClick={() => router.push(`/jobs/${jobId}/shortlist-report/${lastReportId}`)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Last run {timeAgo} · {lastReportShortlistCount ?? 0} shortlisted
        </button>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
