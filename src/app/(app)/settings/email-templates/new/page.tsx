"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createEmailTemplate } from "@/lib/actions/notifications";

const categories = [
  { value: "interview_invite", label: "Interview Invite" },
  { value: "rejection", label: "Rejection" },
  { value: "offer", label: "Offer" },
  { value: "follow_up", label: "Follow-up" },
  { value: "nurture", label: "Nurture" },
  { value: "custom", label: "Custom" },
];

export default function NewEmailTemplatePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [category, setCategory] = useState("custom");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !subject.trim() || !bodyHtml.trim()) {
      setError("Name, subject, and HTML body are required.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await createEmailTemplate({
        name: name.trim(),
        subject: subject.trim(),
        body_html: bodyHtml,
        body_text: bodyText || undefined,
        category,
      });

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        router.push(`/settings/email-templates/${result.data.id}`);
      }
    });
  }

  const inputClassName =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div>
      <Link
        href="/settings/email-templates"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back to Email Templates
      </Link>
      <h2 className="mt-4 text-lg font-semibold">New Email Template</h2>

      <form onSubmit={handleSubmit} className="mt-6 max-w-lg space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Technical Interview Invite"
            className={inputClassName}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClassName}
          >
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Interview for {{job.title}}"
            className={inputClassName}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Use {"{{variable.path}}"} for merge fields
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Body (HTML)</label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={8}
            placeholder="<p>Hi {{candidate.name}},</p>"
            className={inputClassName + " font-mono text-xs"}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Body (Plain Text)
            <span className="ml-1 font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={4}
            className={inputClassName + " font-mono text-xs"}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create Template"}
        </button>
      </form>
    </div>
  );
}
