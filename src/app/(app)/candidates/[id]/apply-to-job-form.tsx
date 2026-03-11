"use client";

import { useActionState } from "react";
import { createApplication } from "@/lib/actions/candidates";

interface ApplyToJobFormProps {
  candidateId: string;
  jobs: Array<{
    id: string;
    title: string;
    firstStageId: string | null;
  }>;
}

type ApplyState = { error: string } | { success: true } | null;

async function handleApply(
  _prev: unknown,
  formData: FormData,
): Promise<ApplyState> {
  const candidateId = formData.get("candidateId") as string;
  const jobOpeningId = formData.get("jobOpeningId") as string;
  const stageId = formData.get("stageId") as string;

  if (!jobOpeningId || !stageId) {
    return { error: "Please select a job" };
  }

  const result = await createApplication(candidateId, jobOpeningId, stageId);
  if ("error" in result && result.error) return { error: result.error };
  return { success: true };
}

export function ApplyToJobForm({ candidateId, jobs }: ApplyToJobFormProps) {
  const [state, action, isPending] = useActionState(handleApply, null);

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No open jobs available for application.
      </p>
    );
  }

  return (
    <form action={action} className="flex items-end gap-3">
      <input type="hidden" name="candidateId" value={candidateId} />

      <div className="flex-1">
        <label
          htmlFor="jobSelect"
          className="block text-sm font-medium text-foreground"
        >
          Apply to Job
        </label>
        <select
          id="jobSelect"
          name="jobOpeningId"
          required
          onChange={(e) => {
            const job = jobs.find((j) => j.id === e.target.value);
            const hidden = e.target.form?.querySelector(
              'input[name="stageId"]',
            ) as HTMLInputElement | null;
            if (hidden && job?.firstStageId) {
              hidden.value = job.firstStageId;
            }
          }}
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Select a job...</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>
        <input
          type="hidden"
          name="stageId"
          defaultValue={jobs[0]?.firstStageId ?? ""}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Applying..." : "Apply"}
      </button>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-success">Applied successfully</p>
      )}
    </form>
  );
}
