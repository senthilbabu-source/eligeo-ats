"use client";

import { useState, useTransition } from "react";
import { updateCandidate } from "@/lib/actions/candidates";

interface EditCandidatePanelProps {
  candidate: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    current_title: string | null;
    current_company: string | null;
    location: string | null;
    linkedin_url: string | null;
  };
}

export function EditCandidatePanel({ candidate }: EditCandidatePanelProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateCandidate(formData);
      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Edit Candidate
        </h2>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <input type="hidden" name="id" value={candidate.id} />

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ec-fullName" className="block text-xs font-medium text-muted-foreground">
              Full Name
            </label>
            <input
              id="ec-fullName"
              name="fullName"
              defaultValue={candidate.full_name}
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="ec-email" className="block text-xs font-medium text-muted-foreground">
              Email
            </label>
            <input
              id="ec-email"
              name="email"
              type="email"
              defaultValue={candidate.email}
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ec-phone" className="block text-xs font-medium text-muted-foreground">
              Phone
            </label>
            <input
              id="ec-phone"
              name="phone"
              defaultValue={candidate.phone ?? ""}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="ec-location" className="block text-xs font-medium text-muted-foreground">
              Location
            </label>
            <input
              id="ec-location"
              name="location"
              defaultValue={candidate.location ?? ""}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ec-currentTitle" className="block text-xs font-medium text-muted-foreground">
              Current Title
            </label>
            <input
              id="ec-currentTitle"
              name="currentTitle"
              defaultValue={candidate.current_title ?? ""}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="ec-currentCompany" className="block text-xs font-medium text-muted-foreground">
              Current Company
            </label>
            <input
              id="ec-currentCompany"
              name="currentCompany"
              defaultValue={candidate.current_company ?? ""}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label htmlFor="ec-linkedinUrl" className="block text-xs font-medium text-muted-foreground">
            LinkedIn URL
          </label>
          <input
            id="ec-linkedinUrl"
            name="linkedinUrl"
            type="url"
            defaultValue={candidate.linkedin_url ?? ""}
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
