"use client";

import { useActionState } from "react";
import { deleteEmailTemplate } from "@/lib/actions/notifications";

interface Props {
  templateId: string;
  templateName: string;
}

export function DeleteEmailTemplateButton({ templateId, templateName }: Props) {
  const [state, formAction, isPending] = useActionState(
    async () => {
      const ok = window.confirm(
        `Delete "${templateName}"? This cannot be undone.`,
      );
      if (!ok) return null;
      return deleteEmailTemplate(templateId);
    },
    null,
  );

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        {isPending ? "Deleting..." : "Delete"}
      </button>
      {state && "error" in state && (
        <p className="mt-1 text-xs text-destructive">{state.error}</p>
      )}
    </form>
  );
}
