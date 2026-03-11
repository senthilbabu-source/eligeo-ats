"use client";

import Link from "next/link";
import { useActionState } from "react";
import { moveStage } from "@/lib/actions/candidates";

interface Stage {
  id: string;
  name: string;
  stage_type: string;
  sort_order: number;
}

interface Application {
  id: string;
  status: string;
  current_stage_id: string;
  applied_at: string;
  candidate: {
    id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
  } | null;
}

const STAGE_COLORS: Record<string, string> = {
  sourced: "border-t-blue-400",
  applied: "border-t-indigo-400",
  screening: "border-t-amber-400",
  interview: "border-t-purple-400",
  offer: "border-t-emerald-400",
  hired: "border-t-green-500",
  rejected: "border-t-red-400",
};

function MoveButton({
  applicationId,
  toStageId,
  label,
  variant,
}: {
  applicationId: string;
  toStageId: string;
  label: string;
  variant: "left" | "right";
}) {
  async function handleMove(_prev: unknown) {
    return await moveStage(applicationId, toStageId);
  }

  const [, formAction, isPending] = useActionState(handleMove, null);

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={isPending}
        className={`rounded px-1.5 py-0.5 text-xs transition-colors disabled:opacity-50 ${
          variant === "right"
            ? "bg-primary/10 text-primary hover:bg-primary/20"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
        title={`Move to ${label}`}
      >
        {variant === "left" ? "\u2190" : "\u2192"}
      </button>
    </form>
  );
}

function CandidateCard({
  app,
  stages,
  currentStageIndex,
}: {
  app: Application;
  stages: Stage[];
  currentStageIndex: number;
}) {
  const prevStage = currentStageIndex > 0 ? stages[currentStageIndex - 1] : null;
  const nextStage = currentStageIndex < stages.length - 1 ? stages[currentStageIndex + 1] : null;

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
      <Link
        href={`/candidates/${app.candidate?.id}`}
        className="block font-medium text-sm hover:text-primary"
      >
        {app.candidate?.full_name ?? "Unknown"}
      </Link>
      {app.candidate?.current_title && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {app.candidate.current_title}
          {app.candidate.current_company && ` at ${app.candidate.current_company}`}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {new Date(app.applied_at).toLocaleDateString()}
        </span>
        <div className="flex gap-1">
          {prevStage && (
            <MoveButton
              applicationId={app.id}
              toStageId={prevStage.id}
              label={prevStage.name}
              variant="left"
            />
          )}
          {nextStage && (
            <MoveButton
              applicationId={app.id}
              toStageId={nextStage.id}
              label={nextStage.name}
              variant="right"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function PipelineBoard({
  stages,
  applicationsByStage,
}: {
  jobId: string;
  stages: Stage[];
  applicationsByStage: Record<string, Application[]>;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage, index) => {
        const apps = applicationsByStage[stage.id] ?? [];
        return (
          <div
            key={stage.id}
            className={`flex w-72 shrink-0 flex-col rounded-lg border border-border bg-card ${STAGE_COLORS[stage.stage_type] ?? ""} border-t-2`}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <h3 className="text-sm font-medium">{stage.name}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {apps.length}
              </span>
            </div>
            <div className="flex-1 space-y-2 px-2 pb-2">
              {apps.map((app) => (
                <CandidateCard
                  key={app.id}
                  app={app}
                  stages={stages}
                  currentStageIndex={index}
                />
              ))}
              {apps.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No candidates
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
