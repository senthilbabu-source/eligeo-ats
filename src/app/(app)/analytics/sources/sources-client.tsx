"use client";

import { AiNarrativeCard } from "@/components/analytics/ai-narrative-card";
import type { SourceSnapshot } from "@/lib/analytics/compute";

export function SourcesClient({
  sources,
  orgContext,
}: {
  sources: SourceSnapshot;
  orgContext: { totalOpenJobs: number; teamSize: number; avgTimeToHire: number };
}) {
  const maxApps = Math.max(1, ...sources.sources.map((s) => s.applicationCount));

  return (
    <>
      <div className="mt-6">
        <AiNarrativeCard
          view="source"
          currentPeriod={sources}
          previousPeriod={null}
          orgContext={orgContext}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Source Performance
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Applications</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Shortlist</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Hire Rate</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Avg Days</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Quality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sources.sources.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No source data available.</td>
                </tr>
              ) : (
                sources.sources.map((s) => (
                  <tr key={s.sourceName} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium capitalize">{s.sourceName}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary/70"
                            style={{ width: `${Math.round((s.applicationCount / maxApps) * 100)}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-muted-foreground">{s.applicationCount}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{(s.shortlistRate * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{(s.hireRate * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.avgTimeToHireDays ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <QualityBadge score={s.qualityScore} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function QualityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 60 ? "text-success bg-success/10" : pct >= 40 ? "text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30" : "text-destructive bg-destructive/10";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${color}`}>
      {pct}
    </span>
  );
}
