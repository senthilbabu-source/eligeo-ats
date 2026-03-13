import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ScreeningConfigBuilder } from "./screening-config-builder";
import type { ScreeningQuestion } from "@/lib/types/ground-truth";

/**
 * D32 §7.6 — Screening configuration page for a job.
 * /jobs/[id]/settings/screening
 */
export default async function ScreeningConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: jobId } = await params;
  const session = await requireAuth();
  const supabase = await createClient();

  // Fetch existing config
  const { data: config } = await supabase
    .from("screening_configs")
    .select("*")
    .eq("organization_id", session.orgId)
    .eq("job_opening_id", jobId)
    .is("deleted_at", null)
    .single();

  // Fetch job title
  const { data: job } = await supabase
    .from("job_openings")
    .select("title")
    .eq("id", jobId)
    .eq("organization_id", session.orgId)
    .single();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">AI Screening</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure screening questions for {job?.title ?? "this job"}. Candidates
          entering the screening stage will receive an AI-assisted questionnaire.
        </p>
      </div>

      <ScreeningConfigBuilder
        jobOpeningId={jobId}
        initialConfig={
          config
            ? {
                id: config.id,
                questions: config.questions as ScreeningQuestion[],
                instructions: config.instructions,
                maxDurationMin: config.max_duration_min,
                isActive: config.is_active,
              }
            : null
        }
      />
    </div>
  );
}
