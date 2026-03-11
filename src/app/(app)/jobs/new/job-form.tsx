"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useCompletion } from "@ai-sdk/react";
import { createJob } from "@/lib/actions/jobs";

interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
      {children}
    </label>
  );
}

function Input(props: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

export function JobForm({
  pipelines,
  defaultPipelineId,
}: {
  pipelines: Pipeline[];
  defaultPipelineId?: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createJob, null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const { completion, isLoading: isGenerating, complete } = useCompletion({
    api: "/api/ai/generate-description",
  });

  // Sync streamed completion into the textarea
  useEffect(() => {
    if (completion && descriptionRef.current) {
      descriptionRef.current.value = completion;
    }
  }, [completion]);

  useEffect(() => {
    if (state && "id" in state && state.id) {
      router.push(`/jobs/${state.id}`);
    }
  }, [state, router]);

  function handleGenerate() {
    const title = titleRef.current?.value?.trim();
    if (!title) return;

    const form = titleRef.current?.form;
    const department = form
      ? (new FormData(form).get("department") as string) || undefined
      : undefined;

    complete("", {
      body: { title, department },
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div>
        <Label htmlFor="title">Job Title *</Label>
        <Input ref={titleRef} id="title" name="title" required placeholder="e.g. Senior Software Engineer" />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="description">Description</Label>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Generating...
              </>
            ) : (
              "AI Generate"
            )}
          </button>
        </div>
        <textarea
          ref={descriptionRef}
          id="description"
          name="description"
          rows={isGenerating || completion ? 16 : 6}
          placeholder="Job responsibilities, requirements, and benefits..."
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="department">Department</Label>
          <Input id="department" name="department" placeholder="e.g. Engineering" />
        </div>
        <div>
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" placeholder="e.g. San Francisco, CA" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="locationType">Location Type *</Label>
          <Select id="locationType" name="locationType" defaultValue="on_site">
            <option value="on_site">On-site</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="employmentType">Employment Type *</Label>
          <Select id="employmentType" name="employmentType" defaultValue="full_time">
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
            <option value="freelance">Freelance</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="salaryMin">Salary Min</Label>
          <Input id="salaryMin" name="salaryMin" type="number" min="0" placeholder="80000" />
        </div>
        <div>
          <Label htmlFor="salaryMax">Salary Max</Label>
          <Input id="salaryMax" name="salaryMax" type="number" min="0" placeholder="120000" />
        </div>
        <div>
          <Label htmlFor="salaryCurrency">Currency</Label>
          <Select id="salaryCurrency" name="salaryCurrency" defaultValue="USD">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="INR">INR</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="headcount">Openings</Label>
          <Input id="headcount" name="headcount" type="number" min="1" defaultValue="1" />
        </div>
        <div>
          <Label htmlFor="pipelineTemplateId">Pipeline *</Label>
          <Select id="pipelineTemplateId" name="pipelineTemplateId" defaultValue={defaultPipelineId} required>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.is_default ? " (default)" : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create Job"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-10 items-center rounded-md border border-border px-6 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
