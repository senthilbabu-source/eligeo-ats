"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { moveStage } from "@/lib/actions/candidates";

// ── Types ─────────────────────────────────────────────────

interface Stage {
  id: string;
  name: string;
  stage_type: string;
  stage_order: number;
}

interface Application {
  id: string;
  status: string;
  current_stage_id: string;
  applied_at: string;
  days_in_stage: number | null;
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

// ── Draggable Candidate Card ──────────────────────────────

function DraggableCard({
  app,
  stages,
  currentStageIndex,
  onMoveArrow,
  isMoving,
  jobId,
}: {
  app: Application;
  stages: Stage[];
  currentStageIndex: number;
  onMoveArrow: (applicationId: string, toStageId: string) => void;
  isMoving: boolean;
  jobId: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: app.id });

  const prevStage = currentStageIndex > 0 ? stages[currentStageIndex - 1] : null;
  const nextStage = currentStageIndex < stages.length - 1 ? stages[currentStageIndex + 1] : null;

  // M1-K — left border health indicator based on days_in_stage
  const days = app.days_in_stage;
  const healthBorder =
    days === null ? "" :
    days > 14 ? "border-l-[3px] border-l-red-400" :
    days > 7  ? "border-l-[3px] border-l-amber-400" :
    "";

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-border bg-background p-3 shadow-sm transition-shadow ${healthBorder} ${
        isDragging
          ? "scale-[1.02] opacity-50 shadow-lg ring-2 ring-primary/20"
          : ""
      } ${isMoving ? "opacity-60" : ""}`}
      {...attributes}
      {...listeners}
    >
      <Link
        href={`/candidates/${app.candidate?.id}?jobId=${jobId}`}
        className="block text-sm font-medium hover:text-primary"
        onClick={(e) => {
          // Prevent navigation during drag
          if (isDragging) e.preventDefault();
        }}
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
        {/* Arrow buttons as fallback (mobile + a11y) */}
        <div className="flex gap-1">
          {prevStage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveArrow(app.id, prevStage.id);
              }}
              disabled={isMoving}
              className="rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
              title={`Move to ${prevStage.name}`}
            >
              ←
            </button>
          )}
          {nextStage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveArrow(app.id, nextStage.id);
              }}
              disabled={isMoving}
              className="rounded px-1.5 py-0.5 text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              title={`Move to ${nextStage.name}`}
            >
              →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Overlay Card (shown during drag) ──────────────────────

function OverlayCard({ app }: { app: Application }) {
  return (
    <div className="w-64 scale-[1.02] rounded-lg border border-primary/30 bg-background p-3 shadow-xl ring-2 ring-primary/20">
      <p className="text-sm font-medium">
        {app.candidate?.full_name ?? "Unknown"}
      </p>
      {app.candidate?.current_title && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {app.candidate.current_title}
          {app.candidate.current_company && ` at ${app.candidate.current_company}`}
        </p>
      )}
      <span className="mt-1 block text-[11px] text-muted-foreground">
        {new Date(app.applied_at).toLocaleDateString()}
      </span>
    </div>
  );
}

// ── Droppable Stage Column ────────────────────────────────

function StageColumn({
  stage,
  apps,
  stageIndex,
  stages,
  isOver,
  onMoveArrow,
  movingAppId,
  jobId,
}: {
  stage: Stage;
  apps: Application[];
  stageIndex: number;
  stages: Stage[];
  isOver: boolean;
  onMoveArrow: (applicationId: string, toStageId: string) => void;
  movingAppId: string | null;
  jobId: string;
}) {
  const { setNodeRef } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg border border-t-2 bg-card transition-colors duration-200 ${
        STAGE_COLORS[stage.stage_type] ?? ""
      } ${
        isOver
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
          : "border-border"
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <h3 className="text-sm font-medium">{stage.name}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {apps.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 px-2 pb-2" style={{ minHeight: "4rem" }}>
        {apps.map((app) => (
          <DraggableCard
            key={app.id}
            app={app}
            stages={stages}
            currentStageIndex={stageIndex}
            onMoveArrow={onMoveArrow}
            isMoving={movingAppId === app.id}
            jobId={jobId}
          />
        ))}
        {apps.length === 0 && !isOver && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No candidates
          </p>
        )}
        {apps.length === 0 && isOver && (
          <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-primary/30 py-4">
            <p className="text-xs text-primary/60">Drop here</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pipeline Board (main export) ──────────────────────────

export function PipelineBoard({
  jobId,
  stages,
  applicationsByStage: initialData,
}: {
  jobId: string;
  stages: Stage[];
  applicationsByStage: Record<string, Application[]>;
}) {
  const [appsByStage, setAppsByStage] = useState(initialData);
  const [activeApp, setActiveApp] = useState<Application | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const [movingAppId, setMovingAppId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  // Find which stage an app is in
  const findAppStage = useCallback(
    (appId: string): string | null => {
      for (const [stageId, apps] of Object.entries(appsByStage)) {
        if (apps.some((a) => a.id === appId)) return stageId;
      }
      return null;
    },
    [appsByStage],
  );

  // Shared move logic (used by both DnD and arrow buttons)
  const performMove = useCallback(
    (applicationId: string, fromStageId: string, toStageId: string) => {
      if (fromStageId === toStageId) return;

      // Optimistic update
      setAppsByStage((prev) => {
        const next = { ...prev };
        const app = next[fromStageId]?.find((a) => a.id === applicationId);
        if (!app) return prev;

        next[fromStageId] = (next[fromStageId] ?? []).filter((a) => a.id !== applicationId);
        next[toStageId] = [...(next[toStageId] ?? []), { ...app, current_stage_id: toStageId, days_in_stage: 0 }];
        return next;
      });

      setMovingAppId(applicationId);
      setError(null);

      // Persist
      startTransition(async () => {
        const result = await moveStage(applicationId, toStageId);
        setMovingAppId(null);
        if (result.error) {
          setError(result.error);
          // Rollback
          setAppsByStage(initialData);
        }
      });
    },
    [initialData],
  );

  // Arrow button handler
  const handleMoveArrow = useCallback(
    (applicationId: string, toStageId: string) => {
      const fromStageId = findAppStage(applicationId);
      if (fromStageId) performMove(applicationId, fromStageId, toStageId);
    },
    [findAppStage, performMove],
  );

  function handleDragStart(event: DragStartEvent) {
    const appId = event.active.id as string;
    // Find the app object
    for (const apps of Object.values(appsByStage)) {
      const app = apps.find((a) => a.id === appId);
      if (app) {
        setActiveApp(app);
        break;
      }
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id as string | undefined;
    // over.id is a stage ID (droppable)
    if (overId && stages.some((s) => s.id === overId)) {
      setOverStageId(overId);
    } else {
      setOverStageId(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveApp(null);
    setOverStageId(null);

    if (!over) return;

    const appId = active.id as string;
    const toStageId = over.id as string;
    const fromStageId = findAppStage(appId);

    if (!fromStageId || fromStageId === toStageId) return;

    performMove(appId, fromStageId, toStageId);
  }

  function handleDragCancel() {
    setActiveApp(null);
    setOverStageId(null);
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {isPending && (
        <div className="mb-3 animate-pulse text-xs text-muted-foreground">
          Moving candidate…
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage, index) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              apps={appsByStage[stage.id] ?? []}
              stageIndex={index}
              stages={stages}
              isOver={overStageId === stage.id}
              onMoveArrow={handleMoveArrow}
              movingAppId={movingAppId}
              jobId={jobId}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{
          duration: 300,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }}>
          {activeApp ? <OverlayCard app={activeApp} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
