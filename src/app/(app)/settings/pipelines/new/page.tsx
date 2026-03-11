"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { createPipelineTemplate } from "@/lib/actions/pipelines";

export default function NewPipelinePage() {
  const [state, formAction, isPending] = useActionState(
    createPipelineTemplate,
    null,
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.success && state.id) {
      router.push(`/settings/pipelines/${state.id}`);
    }
  }, [state, router]);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/settings/pipelines"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Pipelines
        </Link>
        <h2 className="mt-2 text-lg font-semibold">New Pipeline Template</h2>
      </div>

      <form action={formAction} className="max-w-md space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-foreground"
          >
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. Standard Engineering Pipeline"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-foreground"
          >
            Description
            <span className="ml-1 text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Describe when to use this pipeline..."
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Creating..." : "Create Pipeline"}
          </button>
          <Link
            href="/settings/pipelines"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
