interface Stage {
  id: string;
  name: string;
  stageType: string;
  order: number;
  isTerminal: boolean;
}

/**
 * D32 §5.1 — Horizontal pipeline progress indicator.
 * Shows simplified stage labels. Current stage is highlighted.
 * Terminal stages (hired/rejected) shown as final status.
 */
export function PipelineProgress({
  stages,
  currentStageId,
  applicationStatus,
}: {
  stages: Stage[];
  currentStageId: string | null;
  applicationStatus: string;
}) {
  // Filter out terminal negative stages for display (rejected shows as status instead)
  const displayStages = stages.filter(
    (s) => s.stageType !== "rejected",
  );

  const currentIdx = displayStages.findIndex((s) => s.id === currentStageId);
  const isTerminal =
    applicationStatus === "hired" ||
    applicationStatus === "rejected" ||
    applicationStatus === "withdrawn";

  return (
    <div className="w-full">
      <div className="flex items-center gap-1">
        {displayStages.map((stage, i) => {
          const isPast = currentIdx > i;
          const isCurrent = stage.id === currentStageId && !isTerminal;
          return (
            <div key={stage.id} className="flex-1">
              <div
                className={`h-2 rounded-full ${
                  isPast
                    ? "bg-emerald-500"
                    : isCurrent
                      ? "bg-blue-500"
                      : "bg-gray-200"
                }`}
              />
              <p
                className={`mt-1 text-xs truncate ${
                  isCurrent
                    ? "font-medium text-foreground"
                    : isPast
                      ? "text-emerald-600"
                      : "text-muted-foreground"
                }`}
              >
                {stage.name}
              </p>
            </div>
          );
        })}
      </div>

      {isTerminal && (
        <div className="mt-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              applicationStatus === "hired"
                ? "bg-green-100 text-green-700"
                : applicationStatus === "withdrawn"
                  ? "bg-gray-100 text-gray-700"
                  : "bg-red-100 text-red-700"
            }`}
          >
            {applicationStatus === "hired"
              ? "Hired"
              : applicationStatus === "withdrawn"
                ? "Withdrawn"
                : "Not selected"}
          </span>
        </div>
      )}
    </div>
  );
}
