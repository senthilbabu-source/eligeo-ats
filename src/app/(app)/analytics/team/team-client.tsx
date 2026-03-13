"use client";

import { AiNarrativeCard } from "@/components/analytics/ai-narrative-card";
import type { TeamSnapshot } from "@/lib/analytics/compute";

export function TeamClient({
  team,
  orgContext,
}: {
  team: TeamSnapshot;
  orgContext: { totalOpenJobs: number; teamSize: number; avgTimeToHire: number };
}) {
  return (
    <>
      <div className="mt-6">
        <AiNarrativeCard
          view="team"
          currentPeriod={team}
          previousPeriod={null}
          orgContext={orgContext}
        />
      </div>

      {/* Recruiters */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recruiters
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Open Jobs</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Pipeline</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Avg Velocity</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Hires (mo)</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Feedback %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {team.recruiters.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No recruiter data.</td>
                </tr>
              ) : (
                team.recruiters.map((r) => (
                  <tr key={r.userId} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.openJobCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.activePipelineCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.avgStageVelocityDays !== null ? `${r.avgStageVelocityDays}d` : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.hiredThisMonth}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{(r.feedbackComplianceRate * 100).toFixed(0)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interviewers */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Interviewers
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Scheduled</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Completed</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Overdue</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Avg Turnaround</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {team.interviewers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No interviewer data.</td>
                </tr>
              ) : (
                team.interviewers.map((iv) => (
                  <tr key={iv.userId} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{iv.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{iv.scheduledCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{iv.completedCount}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${iv.overdueCount > 0 ? "text-destructive font-medium" : ""}`}>
                      {iv.overdueCount}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {iv.avgFeedbackTurnaroundHours !== null ? `${iv.avgFeedbackTurnaroundHours}h` : "—"}
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
