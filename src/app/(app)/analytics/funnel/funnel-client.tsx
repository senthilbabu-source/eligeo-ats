"use client";

import Link from "next/link";
import { AiNarrativeCard } from "@/components/analytics/ai-narrative-card";
import type { FunnelSnapshot } from "@/lib/analytics/compute";

function conversionColor(rate: number): string {
  if (rate >= 0.6) return "bg-success";
  if (rate >= 0.4) return "bg-amber-500";
  return "bg-destructive";
}

export function FunnelClient({
  funnel,
  orgContext,
}: {
  funnel: FunnelSnapshot;
  orgContext: { totalOpenJobs: number; teamSize: number; avgTimeToHire: number };
}) {
  const maxEntered = Math.max(1, ...funnel.stages.map((s) => s.enteredCount));

  return (
    <>
      {/* AI Narrative — renders BEFORE charts (ADR-011) */}
      <div className="mt-6">
        <AiNarrativeCard
          view="funnel"
          currentPeriod={funnel}
          previousPeriod={null}
          orgContext={orgContext}
        />
      </div>

      {/* Summary metrics */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Total Applications" value={funnel.totalApplications} />
        <Metric label="Active" value={funnel.activeApplications} />
        <Metric label="Hired" value={funnel.hiredCount} />
        <Metric label="Overall Conversion" value={`${(funnel.overallConversionRate * 100).toFixed(1)}%`} />
      </div>

      {/* Funnel chart */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Stage Funnel
        </h2>
        <div className="rounded-lg border border-border bg-card p-5">
          {funnel.stages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stage data available.</p>
          ) : (
            <div className="space-y-4">
              {funnel.stages.map((stage, i) => (
                <div key={stage.stageId}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <Link
                      href={`/candidates?stage=${stage.stageId}`}
                      className="font-medium hover:text-primary"
                    >
                      {stage.stageName}
                    </Link>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="tabular-nums">{stage.enteredCount} entered</span>
                      {i > 0 && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white ${conversionColor(stage.conversionRate)}`}>
                          {(stage.conversionRate * 100).toFixed(0)}%
                        </span>
                      )}
                      <span className="tabular-nums">{stage.avgDaysInStage}d avg</span>
                    </div>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-3 rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.round((stage.enteredCount / maxEntered) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Data table */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Stage Details
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Stage</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Current</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Entered</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Exited</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Conv. Rate</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Avg Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {funnel.stages.map((stage) => (
                <tr key={stage.stageId} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{stage.stageName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{stage.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{stage.enteredCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{stage.exitedCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{(stage.conversionRate * 100).toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums">{stage.avgDaysInStage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
