import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { DeleteTemplateButton } from "./delete-template-button";

export default async function PipelinesSettingsPage() {
  const session = await requireAuth();
  const supabase = await createClient();
  const canManage = can(session.orgRole, "pipelines:create");

  const { data: templates } = await supabase
    .from("pipeline_templates")
    .select(
      `
      id, name, description, is_default, created_at,
      pipeline_stages (id)
    `,
    )
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pipeline Templates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define hiring stages candidates move through.
          </p>
        </div>
        {canManage && (
          <Link
            href="/settings/pipelines/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New Pipeline
          </Link>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {templates && templates.length > 0 ? (
          templates.map((tpl) => {
            const stageCount = Array.isArray(tpl.pipeline_stages)
              ? tpl.pipeline_stages.length
              : 0;
            return (
              <div
                key={tpl.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/settings/pipelines/${tpl.id}`}
                      className="font-medium text-sm hover:text-primary"
                    >
                      {tpl.name}
                    </Link>
                    {tpl.is_default && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stageCount} stage{stageCount !== 1 ? "s" : ""}
                    {tpl.description ? ` · ${tpl.description}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/settings/pipelines/${tpl.id}`}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Edit
                  </Link>
                  {canManage && !tpl.is_default && (
                    <DeleteTemplateButton templateId={tpl.id} templateName={tpl.name} />
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No pipeline templates yet.
            </p>
            {canManage && (
              <Link
                href="/settings/pipelines/new"
                className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
              >
                Create your first pipeline
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
