"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ScorecardTemplateForm } from "../scorecard-template-form";
import { createScorecardTemplate } from "@/lib/actions/scorecards";

export default function NewScorecardTemplatePage() {
  const router = useRouter();

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/settings/scorecards"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Scorecards
        </Link>
        <h2 className="mt-2 text-lg font-semibold">New Scorecard Template</h2>
      </div>

      <ScorecardTemplateForm
        submitLabel="Create Template"
        submittingLabel="Creating..."
        onSubmit={async (data) => {
          const result = await createScorecardTemplate(data);
          if (result.success && "id" in result) {
            router.push(`/settings/scorecards/${result.id}`);
          }
          return result;
        }}
      />
    </div>
  );
}
