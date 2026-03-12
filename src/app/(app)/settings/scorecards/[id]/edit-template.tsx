"use client";

import { useState } from "react";
import Link from "next/link";
import { ScorecardTemplateForm, type CategoryInput } from "../scorecard-template-form";
import { updateScorecardTemplate } from "@/lib/actions/scorecards";

interface TemplateData {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  categories: Array<{
    id: string;
    name: string;
    position: number;
    weight: number;
    attributes: Array<{
      id: string;
      name: string;
      description: string | null;
      position: number;
    }>;
  }>;
}

export function EditScorecardTemplate({ template }: { template: TemplateData }) {
  const [saved, setSaved] = useState(false);

  const initialCategories: CategoryInput[] = template.categories.map((cat) => ({
    name: cat.name,
    weight: cat.weight,
    attributes: cat.attributes.map((attr) => ({
      name: attr.name,
      description: attr.description ?? "",
    })),
  }));

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/settings/scorecards"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Scorecards
        </Link>
        <h2 className="mt-2 text-lg font-semibold">Edit: {template.name}</h2>
      </div>

      {saved && (
        <div className="mb-4 rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">
          Template saved successfully.
        </div>
      )}

      <ScorecardTemplateForm
        initialName={template.name}
        initialDescription={template.description ?? ""}
        initialIsDefault={template.is_default}
        initialCategories={initialCategories}
        submitLabel="Save Changes"
        submittingLabel="Saving..."
        onSubmit={async (data) => {
          setSaved(false);
          const result = await updateScorecardTemplate({
            templateId: template.id,
            ...data,
          });
          if (result.success) {
            setSaved(true);
          }
          return result;
        }}
      />
    </div>
  );
}
