import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { JobForm } from "./job-form";

export const metadata: Metadata = {
  title: "New Job — Eligeo",
};

export default async function NewJobPage() {
  const session = await requireAuth();
  assertCan(session.orgRole, "jobs:create");

  const supabase = await createClient();

  const { data: pipelines } = await supabase
    .from("pipeline_templates")
    .select("id, name, is_default")
    .order("is_default", { ascending: false });

  const defaultPipeline = pipelines?.find((p) => p.is_default);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">New Job</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Jobs are created as drafts. Publish when ready.
      </p>
      <div className="mt-8">
        <JobForm
          pipelines={pipelines ?? []}
          defaultPipelineId={defaultPipeline?.id}
        />
      </div>
    </div>
  );
}
