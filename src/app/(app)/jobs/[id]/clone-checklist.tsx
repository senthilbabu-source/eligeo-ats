"use client";

import { useTransition } from "react";
import { dismissChecklistItem } from "@/lib/actions/jobs";
import type { CloneChecklistItem, JobMetadata } from "@/lib/types/ground-truth";

interface Props {
  jobId: string;
  jobMeta: JobMetadata;
  hasSalary: boolean;
  hasHiringManager: boolean;
  hasEmbedding: boolean;
}

const ITEMS: { key: CloneChecklistItem; label: string; hint: string }[] = [
  { key: "title_updated", label: "Title updated", hint: "Change the job title if this role is for a different level or team" },
  { key: "skills_reviewed", label: "Skills reviewed", hint: "Review AI skill suggestions above and update required skills" },
  { key: "hiring_manager_assigned", label: "Hiring manager assigned", hint: "Assign or confirm the hiring manager for this role" },
  { key: "salary_set", label: "Salary set", hint: "Set salary range so candidates can see compensation" },
  { key: "embedding_generated", label: "AI matching ready", hint: "Embedding is generated — AI candidate matching will work for this job" },
  { key: "bias_checked", label: "Bias checked", hint: "Run AI Rewrite to check for biased language in the job description" },
];

export function CloneChecklist({ jobId, jobMeta, hasSalary, hasHiringManager, hasEmbedding }: Props) {
  const [isPending, startTransition] = useTransition();
  const dismissed = jobMeta.clone_checklist_dismissed ?? {};

  // Auto-derive completion for non-manually-dismissed items
  const autoCompleted: Partial<Record<CloneChecklistItem, boolean>> = {
    salary_set: hasSalary,
    hiring_manager_assigned: hasHiringManager,
    embedding_generated: hasEmbedding,
  };

  const pendingItems = ITEMS.filter((item) => {
    if (dismissed[item.key]) return false;
    if (autoCompleted[item.key]) return false;
    return true;
  });

  if (pendingItems.length === 0) return null;

  function dismiss(item: CloneChecklistItem) {
    startTransition(async () => {
      await dismissChecklistItem(jobId, item);
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-amber-600 dark:text-amber-400">⚠</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Post-clone checklist — {pendingItems.length} item{pendingItems.length !== 1 ? "s" : ""} remaining
          </p>
          <ul className="mt-2 space-y-2">
            {pendingItems.map((item) => (
              <li key={item.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{item.label}</p>
                  <p className="text-xs text-amber-700/70 dark:text-amber-400/70">{item.hint}</p>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => dismiss(item.key)}
                  className="shrink-0 text-[10px] text-amber-600 underline hover:text-amber-800 disabled:opacity-50 dark:text-amber-400"
                >
                  Done
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
