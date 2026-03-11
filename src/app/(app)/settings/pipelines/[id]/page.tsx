import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { PipelineEditor } from "./pipeline-editor";

export default async function PipelineEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();
  const supabase = await createClient();
  const canManage = can(session.orgRole, "pipelines:create");

  const { data: template } = await supabase
    .from("pipeline_templates")
    .select("id, name, description, is_default")
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!template) notFound();

  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("id, name, stage_type, stage_order, is_terminal")
    .eq("pipeline_template_id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("stage_order");

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/settings/pipelines"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Pipelines
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h2 className="text-lg font-semibold">{template.name}</h2>
          {template.is_default && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Default
            </span>
          )}
        </div>
        {template.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {template.description}
          </p>
        )}
      </div>

      <PipelineEditor
        templateId={id}
        stages={stages ?? []}
        canManage={canManage}
      />
    </div>
  );
}
