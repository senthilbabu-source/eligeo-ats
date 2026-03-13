"use client";

import { useState, useEffect } from "react";

type NarrativeResult = {
  headline: string | null;
  narrative: string | null;
  topAction: string | null;
  anomalies: string[];
  error?: string;
};

/**
 * AI Narrative Card — renders BEFORE charts on every analytics view (ADR-011).
 * Fetches narrative from POST /api/analytics/narrative on mount.
 * Shows skeleton during loading. Never blocks the analytics page on AI generation.
 */
export function AiNarrativeCard({
  view,
  currentPeriod,
  previousPeriod,
  orgContext,
}: {
  view: "funnel" | "velocity" | "source" | "team" | "jobs";
  currentPeriod: object;
  previousPeriod: object | null;
  orgContext: { totalOpenJobs: number; teamSize: number; avgTimeToHire: number };
}) {
  const [data, setData] = useState<NarrativeResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchNarrative() {
      try {
        const res = await fetch("/api/analytics/narrative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ view, currentPeriod, previousPeriod, orgContext }),
        });
        if (!cancelled && res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        // Non-blocking — narrative failure should not break the page
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchNarrative();
    return () => { cancelled = true; };
  }, [view, currentPeriod, previousPeriod, orgContext]);

  if (loading) {
    return (
      <div className="animate-pulse rounded-lg border border-border bg-card p-5">
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="mt-3 h-3 w-full rounded bg-muted" />
        <div className="mt-2 h-3 w-4/5 rounded bg-muted" />
      </div>
    );
  }

  if (!data || data.error || !data.headline) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          AI insights unavailable — {data?.error ?? "narrative could not be generated"}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-primary">✦</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{data.headline}</p>
          <p className="mt-1 text-sm text-muted-foreground">{data.narrative}</p>
          {data.topAction && (
            <p className="mt-2 text-sm font-medium text-primary">→ {data.topAction}</p>
          )}
          {data.anomalies.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.anomalies.map((anomaly, i) => (
                <span
                  key={i}
                  className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                >
                  {anomaly}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
