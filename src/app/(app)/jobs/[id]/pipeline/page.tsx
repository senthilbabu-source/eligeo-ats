import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { PipelineBoard } from "./pipeline-board";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("job_openings")
    .select("title")
    .eq("id", id)
    .single();

  return { title: `Pipeline — ${job?.title ?? "Job"}` };
}

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();
  const supabase = await createClient();

  // Fetch job with pipeline template
  const { data: job } = await supabase
    .from("job_openings")
    .select("id, title, pipeline_template_id")
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!job) notFound();

  // Fetch pipeline stages ordered by stage_order
  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("id, name, stage_type, stage_order")
    .eq("pipeline_template_id", job.pipeline_template_id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("stage_order");

  // Fetch applications with candidate info for this job
  const { data: applications } = await supabase
    .from("applications")
    .select(
      `
      id, status, current_stage_id, applied_at,
      candidates:candidate_id (id, full_name, current_title, current_company)
    `,
    )
    .eq("job_opening_id", id)
    .eq("organization_id", session.orgId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("applied_at", { ascending: false });

  // M1-K — compute days_in_stage for each application (latest stage history entry = stage entry time)
  const appIds = (applications ?? []).map((a) => a.id);
  const stageEntryByApp: Record<string, Date> = {};
  if (appIds.length > 0) {
    const { data: history } = await supabase
      .from("application_stage_history")
      .select("application_id, created_at")
      .in("application_id", appIds)
      .eq("organization_id", session.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    for (const row of history ?? []) {
      if (!stageEntryByApp[row.application_id]) {
        stageEntryByApp[row.application_id] = new Date(row.created_at);
      }
    }
  }
  const nowMs = new Date().getTime();

  // Group applications by stage
  const applicationsByStage: Record<
    string,
    Array<{
      id: string;
      status: string;
      current_stage_id: string;
      applied_at: string;
      days_in_stage: number | null;
      candidate: { id: string; full_name: string; current_title: string | null; current_company: string | null } | null;
    }>
  > = {};

  for (const stage of stages ?? []) {
    applicationsByStage[stage.id] = [];
  }

  for (const app of applications ?? []) {
    const candidateRaw = app.candidates as unknown;
    const candidate = (Array.isArray(candidateRaw) ? candidateRaw[0] : candidateRaw) as {
      id: string;
      full_name: string;
      current_title: string | null;
      current_company: string | null;
    } | null;

    const enteredAt = stageEntryByApp[app.id];
    const days_in_stage = enteredAt
      ? Math.floor((nowMs - enteredAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const stageApps = applicationsByStage[app.current_stage_id];
    if (stageApps) {
      stageApps.push({
        ...app,
        candidate,
        days_in_stage,
      });
    }
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href={`/jobs/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Job Details
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          {job.title} — Pipeline
        </h1>
      </div>

      <PipelineBoard
        jobId={id}
        stages={stages ?? []}
        applicationsByStage={applicationsByStage}
      />
    </div>
  );
}
