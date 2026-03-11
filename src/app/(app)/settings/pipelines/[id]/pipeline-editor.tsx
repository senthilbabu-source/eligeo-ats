"use client";

import { useState, useTransition, useActionState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  reorderStages,
  addStage,
  removeStage,
  updateStage,
} from "@/lib/actions/pipelines";

const STAGE_TYPES = [
  "sourced",
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
] as const;

const STAGE_TYPE_COLORS: Record<string, string> = {
  sourced: "bg-blue-100 text-blue-700",
  applied: "bg-indigo-100 text-indigo-700",
  screening: "bg-amber-100 text-amber-700",
  interview: "bg-purple-100 text-purple-700",
  offer: "bg-emerald-100 text-emerald-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

interface Stage {
  id: string;
  name: string;
  stage_type: string;
  stage_order: number;
  is_terminal: boolean;
}

// ── Sortable Stage Row ─────────────────────────────────────

function SortableStage({
  stage,
  canManage,
  onRemove,
  onUpdate,
}: {
  stage: Stage;
  canManage: boolean;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: { name?: string; stageType?: string; isTerminal?: boolean }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [stageType, setStageType] = useState(stage.stage_type);
  const [isTerminal, setIsTerminal] = useState(stage.is_terminal);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id, disabled: !canManage });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function handleSave() {
    const updates: { name?: string; stageType?: string; isTerminal?: boolean } = {};
    if (name !== stage.name) updates.name = name;
    if (stageType !== stage.stage_type) updates.stageType = stageType;
    if (isTerminal !== stage.is_terminal) updates.isTerminal = isTerminal;

    if (Object.keys(updates).length > 0) {
      onUpdate(stage.id, updates);
    }
    setEditing(false);
  }

  function handleCancel() {
    setName(stage.name);
    setStageType(stage.stage_type);
    setIsTerminal(stage.is_terminal);
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 ${
        isDragging ? "shadow-lg ring-2 ring-primary/20" : ""
      }`}
    >
      {/* Drag handle */}
      {canManage && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Reorder ${stage.name}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </button>
      )}

      {/* Stage order badge */}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
        {stage.stage_order + 1}
      </span>

      {editing ? (
        /* Edit mode */
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <select
            value={stageType}
            onChange={(e) => setStageType(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {STAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={isTerminal}
              onChange={(e) => setIsTerminal(e.target.checked)}
              className="rounded"
            />
            Terminal
          </label>
          <button
            onClick={handleSave}
            className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      ) : (
        /* Display mode */
        <>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium">{stage.name}</span>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              STAGE_TYPE_COLORS[stage.stage_type] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {stage.stage_type}
          </span>
          {stage.is_terminal && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Terminal
            </span>
          )}
          {canManage && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditing(true)}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Edit
              </button>
              <button
                onClick={() => onRemove(stage.id)}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                Remove
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Add Stage Form ─────────────────────────────────────────

function AddStageForm({ templateId }: { templateId: string }) {
  const [state, formAction, isPending] = useActionState(addStage, null);

  return (
    <form action={formAction} className="mt-4 rounded-lg border border-dashed border-border p-4">
      <h3 className="mb-3 text-sm font-medium">Add Stage</h3>
      <input type="hidden" name="pipelineTemplateId" value={templateId} />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="stageName" className="block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            id="stageName"
            name="name"
            type="text"
            required
            placeholder="e.g. Phone Screen"
            className="mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="stageType" className="block text-xs font-medium text-muted-foreground">
            Type
          </label>
          <select
            id="stageType"
            name="stageType"
            className="mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {STAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" name="isTerminal" value="true" className="rounded" />
          Terminal stage
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add"}
        </button>
      </div>
      {state?.error && (
        <p className="mt-2 text-sm text-destructive">{state.error}</p>
      )}
    </form>
  );
}

// ── Main Pipeline Editor ───────────────────────────────────

export function PipelineEditor({
  templateId,
  stages: initialStages,
  canManage,
}: {
  templateId: string;
  stages: Stage[];
  canManage: boolean;
}) {
  const [stages, setStages] = useState(initialStages);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);

    const reordered = arrayMove(stages, oldIndex, newIndex).map(
      (s, i) => ({ ...s, stage_order: i }),
    );
    setStages(reordered);

    // Persist reorder
    startTransition(async () => {
      const result = await reorderStages(
        templateId,
        reordered.map((s) => s.id),
      );
      if (result.error) {
        setError(result.error);
        setStages(initialStages); // Rollback on failure
      } else {
        setError(null);
      }
    });
  }

  function handleRemove(stageId: string) {
    startTransition(async () => {
      const result = await removeStage(stageId);
      if (result.error) {
        setError(result.error);
      } else {
        setStages((prev) => prev.filter((s) => s.id !== stageId));
        setError(null);
      }
    });
  }

  function handleUpdate(
    stageId: string,
    updates: { name?: string; stageType?: string; isTerminal?: boolean },
  ) {
    startTransition(async () => {
      const result = await updateStage(stageId, updates);
      if (result.error) {
        setError(result.error);
      } else {
        setStages((prev) =>
          prev.map((s) =>
            s.id === stageId
              ? {
                  ...s,
                  name: updates.name ?? s.name,
                  stage_type: updates.stageType ?? s.stage_type,
                  is_terminal: updates.isTerminal ?? s.is_terminal,
                }
              : s,
          ),
        );
        setError(null);
      }
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {isPending && (
        <div className="mb-4 text-xs text-muted-foreground animate-pulse">
          Saving...
        </div>
      )}

      {stages.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={stages.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2" role="list" aria-label="Pipeline stages">
              {stages.map((stage) => (
                <SortableStage
                  key={stage.id}
                  stage={stage}
                  canManage={canManage}
                  onRemove={handleRemove}
                  onUpdate={handleUpdate}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="rounded-lg border border-dashed border-border py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No stages defined. Add your first stage below.
          </p>
        </div>
      )}

      {canManage && <AddStageForm templateId={templateId} />}
    </div>
  );
}
