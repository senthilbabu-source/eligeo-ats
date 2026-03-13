import type { Metadata } from "next";
import Link from "next/link";
import { getApplicationStatus } from "@/lib/actions/portal-status";
import { StatusTimeline } from "@/components/portal/status-timeline";
import { PipelineProgress } from "@/components/portal/pipeline-progress";
import { WithdrawButton } from "@/components/portal/withdraw-button";

export const metadata: Metadata = {
  title: "Application Status — Eligeo",
};

/**
 * D32 §5.1 — Candidate status portal page.
 * Route: /careers/{slug}/status?token={jwt}
 *
 * Token-based access — no auth required.
 * Displays application progress, timeline, AI narration (Growth+), and withdrawal option.
 */
export default async function StatusPage({
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  const tokenStr = typeof token === "string" ? token : null;

  if (!tokenStr) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Invalid Link</h1>
        <p className="mt-2 text-muted-foreground">
          This status link is missing or invalid. Please check the link from
          your confirmation email.
        </p>
      </div>
    );
  }

  const data = await getApplicationStatus(tokenStr);

  if ("error" in data && data.error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Unable to Load Status</h1>
        <p className="mt-2 text-muted-foreground">{data.error}</p>
        <Link
          href="/careers"
          className="mt-4 inline-block text-sm text-blue-600 hover:underline"
        >
          Browse open positions
        </Link>
      </div>
    );
  }

  if (!("application" in data) || !data.application) {
    return null;
  }

  const application = data.application;
  const job = data.job;
  const org = data.org;
  const currentStage = data.currentStage;
  const stages = data.stages ?? [];
  const timeline = data.timeline ?? [];
  const daysInStage = data.daysInStage ?? 0;
  const narration = data.narration;
  const isGrowthPlus = data.isGrowthPlus;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/careers"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Browse positions
      </Link>

      {/* Application Summary Card */}
      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {job?.title ?? "Position"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {org?.name ?? "Company"}
          {" · Applied "}
          {new Date(application.appliedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>

        {/* AI narration (Growth+ only) */}
        {narration && (
          <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 p-3">
            <p className="text-sm text-blue-800">{narration}</p>
            {isGrowthPlus && (
              <p className="mt-1 text-xs text-blue-500" title="Status updates are AI-assisted">
                AI-assisted update
              </p>
            )}
          </div>
        )}

        {/* Fallback: plain stage label */}
        {!narration && currentStage && application.status === "active" && (
          <p className="mt-4 text-sm font-medium">
            Current stage: {currentStage.name}
            {daysInStage > 0 && (
              <span className="ml-1 text-muted-foreground">
                ({daysInStage} {daysInStage === 1 ? "day" : "days"})
              </span>
            )}
          </p>
        )}
      </div>

      {/* Pipeline Progress */}
      {stages.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Progress
          </h2>
          <PipelineProgress
            stages={stages}
            currentStageId={currentStage ? stages.find(s => s.stageType === currentStage.stageType)?.id ?? null : null}
            applicationStatus={application.status}
          />
        </div>
      )}

      {/* Timeline */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Activity
        </h2>
        <StatusTimeline events={timeline} />
      </div>

      {/* Actions */}
      {application.status === "active" && (
        <div className="mt-8 border-t border-border pt-6">
          <WithdrawButton token={tokenStr} />
        </div>
      )}
    </div>
  );
}
