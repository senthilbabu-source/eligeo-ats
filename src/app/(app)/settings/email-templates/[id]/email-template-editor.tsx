"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEmailTemplate, previewEmailTemplate } from "@/lib/actions/notifications";

const categories = [
  { value: "interview_invite", label: "Interview Invite" },
  { value: "rejection", label: "Rejection" },
  { value: "offer", label: "Offer" },
  { value: "follow_up", label: "Follow-up" },
  { value: "nurture", label: "Nurture" },
  { value: "custom", label: "Custom" },
];

interface TemplateData {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string;
  category: string;
  merge_fields: string[];
}

interface Props {
  template: TemplateData;
  canEdit: boolean;
}

export function EmailTemplateEditor({ template, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [bodyText, setBodyText] = useState(template.body_text);
  const [category, setCategory] = useState(template.category);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Preview state
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  function handleSave() {
    startTransition(async () => {
      setError(null);
      setSaved(false);

      const updates: Record<string, string | string[]> = {};
      if (name !== template.name) updates.name = name;
      if (subject !== template.subject) updates.subject = subject;
      if (bodyHtml !== template.body_html) updates.body_html = bodyHtml;
      if (bodyText !== template.body_text) updates.body_text = bodyText;
      if (category !== template.category) updates.category = category;

      if (Object.keys(updates).length === 0) {
        setError("No changes to save.");
        return;
      }

      const result = await updateEmailTemplate({ id: template.id, ...updates });
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function handlePreview() {
    startTransition(async () => {
      const result = await previewEmailTemplate({
        templateId: template.id,
        variables: {
          candidate: { name: "Jane Doe", email: "jane@example.com" },
          job: { title: "Senior Engineer", department: "Engineering" },
          organization: { name: "Acme Corp" },
          recruiter: { name: "John Smith", email: "john@acme.com" },
        },
      });

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setPreviewHtml(result.data.body_html);
        setShowPreview(true);
      }
    });
  }

  const inputClassName =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
            className={inputClassName}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={!canEdit}
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
            disabled={!canEdit}
            className={inputClassName}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Use {"{{variable.path}}"} for merge fields (e.g. {"{{candidate.name}}"})
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Body (HTML)</label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            disabled={!canEdit}
            rows={10}
            className={inputClassName + " font-mono text-xs"}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Body (Plain Text)
          </label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            disabled={!canEdit}
            rows={5}
            className={inputClassName + " font-mono text-xs"}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && (
        <p className="text-sm text-green-600">Template saved successfully.</p>
      )}

      <div className="flex gap-3">
        {canEdit && (
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        )}
        <button
          onClick={handlePreview}
          disabled={isPending}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          Preview
        </button>
      </div>

      {showPreview && previewHtml && (
        <div className="mt-4 rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Preview</h3>
            <button
              onClick={() => setShowPreview(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <div
            className="rounded-md border border-input bg-white p-4 text-sm"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      )}
    </div>
  );
}
