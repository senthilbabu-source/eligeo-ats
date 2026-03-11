"use client";

import { useActionState } from "react";
import { submitPublicApplication } from "@/lib/actions/public-apply";

interface ApplicationFormProps {
  jobId: string;
  jobTitle: string;
}

export function ApplicationForm({ jobId, jobTitle }: ApplicationFormProps) {
  const [state, action, isPending] = useActionState(
    submitPublicApplication,
    null,
  );

  if (state?.success) {
    return (
      <div className="mt-10 rounded-lg border border-success/30 bg-success/5 p-8 text-center">
        <div className="text-2xl">&#10003;</div>
        <h2 className="mt-2 text-lg font-semibold">Application Submitted</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Thank you for applying to {jobTitle}. We&apos;ll review your
          application and get back to you.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Apply for this role</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Fill out the form below. All fields marked with * are required.
      </p>

      {state?.error && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="jobOpeningId" value={jobId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-medium text-foreground"
            >
              Full Name *
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              placeholder="Jane Doe"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground"
            >
              Email *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="jane@example.com"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-foreground"
            >
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label
              htmlFor="linkedinUrl"
              className="block text-sm font-medium text-foreground"
            >
              LinkedIn URL
            </label>
            <input
              id="linkedinUrl"
              name="linkedinUrl"
              type="url"
              placeholder="https://linkedin.com/in/janedoe"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="coverLetter"
            className="block text-sm font-medium text-foreground"
          >
            Why are you interested in this role?
          </label>
          <textarea
            id="coverLetter"
            name="coverLetter"
            rows={4}
            maxLength={5000}
            placeholder="Tell us about yourself and why you'd be a great fit..."
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Phase 2.6: Add AI resume upload — drag-drop zone that triggers OpenAI structured parsing */}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
        >
          {isPending ? "Submitting..." : "Submit Application"}
        </button>
      </form>
    </div>
  );
}
