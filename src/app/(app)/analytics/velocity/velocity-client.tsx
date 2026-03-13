"use client";

import { AiNarrativeCard } from "@/components/analytics/ai-narrative-card";
import type { VelocitySnapshot } from "@/lib/analytics/compute";

export function VelocityClient({
  velocity,
  orgContext,
}: {
  velocity: VelocitySnapshot;
  orgContext: { totalOpenJobs: number; teamSize: number; avgTimeToHire: number };
}) {
  const maxDays = Math.max(1, ...velocity.stageVelocity.map((s) => s.avgDays));

  return (
    <>
      <div className="mt-6">
        <AiNarrativeCard
          view="velocity"
          currentPeriod={velocity}
          previousPeriod={null}
          orgContext={orgContext}
        />
      </div>

      {/* Key metrics */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Avg Time to Hire" value={velocity.avgTimeToHireDays !== null ? `${velocity.avgTimeToHireDays}d` : "—"} />
        <Metric label="Median Time to Hire" value={velocity.medianTimeToHireDays !== null ? `${velocity.medianTimeToHireDays}d` : "—"} />
        <Metric label="Avg Time to Fill" value={velocity.avgTimeToFillDays !== null ? `${velocity.avgTimeToFillDays}d` : "—"} />
        <Metric label="At-Risk Jobs" value={velocity.openJobsAtRisk} highlight={velocity.openJobsAtRisk > 0} />
      </div>

      {/* Stage velocity chart */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Stage Velocity
          {velocity.bottleneckStage && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              Bottleneck: {velocity.bottleneckStage}
            </span>
          )}
        </h2>
        <div className="rounded-lg border border-border bg-card p-5">
          {velocity.stageVelocity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No velocity data available.</p>
          ) : (
            <div className="space-y-3">
              {velocity.stageVelocity.map((stage) => (
                <div key={stage.stageName}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{stage.stageName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {stage.avgDays}d avg · P75: {stage.p75Days}d · P90: {stage.p90Days}d
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        stage.stageName === velocity.bottleneckStage ? "bg-amber-500" : "bg-primary"
                      }`}
                      style={{ width: `${Math.round((stage.avgDays / maxDays) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border bg-card p-4 ${highlight ? "border-amber-300 dark:border-amber-700" : "border-border"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</p>
    </div>
  );
}
