"use client";

import { useEffect, useState } from "react";
import { getJobSkillsDelta } from "@/lib/actions/jobs";
import type { CloneIntent } from "@/lib/types/ground-truth";

interface Props {
  jobId: string;
  cloneIntent: CloneIntent;
}

type Delta = {
  add: { name: string; importance: "required" | "preferred" | "nice_to_have" }[];
  remove: string[];
};

export function SkillsDeltaPanel({ jobId, cloneIntent }: Props) {
  const [delta, setDelta] = useState<Delta | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getJobSkillsDelta(jobId).then((result) => {
      if (!result.error && (result.add?.length || result.remove?.length)) {
        setDelta({ add: result.add ?? [], remove: result.remove ?? [] });
      }
    });
  }, [jobId]);

  if (!delta || dismissed || (delta.add.length === 0 && delta.remove.length === 0)) {
    return null;
  }

  const reasonLabel = cloneIntent.reason.replace(/_/g, " ");

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">AI Skills Suggestions</h3>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Based on your clone intent ({reasonLabel}), you may want to update these skills:
      </p>

      {delta.add.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-green-700 dark:text-green-400">
            Suggested additions
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {delta.add.map((s) => (
              <span
                key={s.name}
                className="flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
              >
                + {s.name}
                <span className="text-[10px] text-green-500">
                  ({s.importance.replace(/_/g, " ")})
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {delta.remove.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">
            Consider removing
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {delta.remove.map((name) => (
              <span
                key={name}
                className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
              >
                − {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
