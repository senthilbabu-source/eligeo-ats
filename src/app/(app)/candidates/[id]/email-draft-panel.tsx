"use client";

import { useActionState, useState } from "react";
import { aiDraftEmail } from "@/lib/actions/ai";

interface EmailDraftPanelProps {
  candidateName: string;
  jobOptions: Array<{ id: string; title: string }>;
}

const EMAIL_TYPES = [
  { value: "rejection", label: "Rejection" },
  { value: "outreach", label: "Outreach" },
  { value: "update", label: "Status Update" },
  { value: "follow_up", label: "Follow-up" },
] as const;

const TONES = [
  { value: "warm", label: "Warm" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
] as const;

export function EmailDraftPanel({ candidateName, jobOptions }: EmailDraftPanelProps) {
  const [state, formAction, isPending] = useActionState(aiDraftEmail, null);
  const [copiedField, setCopiedField] = useState<"subject" | "body" | null>(null);

  async function copyToClipboard(text: string, field: "subject" | "body") {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  return (
    <div className="mt-8 rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        AI Email Draft
      </h2>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="candidateName" value={candidateName} />

        <div className="grid grid-cols-2 gap-4">
          {/* Job title */}
          <div>
            <label htmlFor="ed-jobTitle" className="block text-xs font-medium text-muted-foreground">
              Job
            </label>
            {jobOptions.length > 0 ? (
              <select
                id="ed-jobTitle"
                name="jobTitle"
                required
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select job...</option>
                {jobOptions.map((j) => (
                  <option key={j.id} value={j.title}>
                    {j.title}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="ed-jobTitle"
                name="jobTitle"
                type="text"
                required
                placeholder="Job title"
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
          </div>

          {/* Email type */}
          <div>
            <label htmlFor="ed-type" className="block text-xs font-medium text-muted-foreground">
              Type
            </label>
            <select
              id="ed-type"
              name="type"
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {EMAIL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Tone */}
          <div>
            <label htmlFor="ed-tone" className="block text-xs font-medium text-muted-foreground">
              Tone
            </label>
            <select
              id="ed-tone"
              name="tone"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Context (optional) */}
          <div>
            <label htmlFor="ed-context" className="block text-xs font-medium text-muted-foreground">
              Context <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <input
              id="ed-context"
              name="context"
              type="text"
              placeholder="e.g. strong culture fit, salary mismatch"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Generating..." : "Generate Draft"}
        </button>
      </form>

      {/* Draft result */}
      {state && "subject" in state && state.subject && (
        <div className="mt-5 space-y-3">
          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Subject</p>
                <p className="mt-0.5 text-sm">{state.subject}</p>
              </div>
              <button
                type="button"
                onClick={() => void copyToClipboard(state.subject!, "subject")}
                className="shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {copiedField === "subject" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">Body</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{state.body}</p>
              </div>
              <button
                type="button"
                onClick={() => void copyToClipboard(state.body ?? "", "body")}
                className="shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {copiedField === "body" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
