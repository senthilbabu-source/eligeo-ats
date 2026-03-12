import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { DeleteEmailTemplateButton } from "./delete-template-button";

const categoryLabels: Record<string, string> = {
  interview_invite: "Interview Invite",
  rejection: "Rejection",
  offer: "Offer",
  follow_up: "Follow-up",
  nurture: "Nurture",
  custom: "Custom",
};

export default async function EmailTemplatesSettingsPage() {
  const session = await requireAuth();
  const supabase = await createClient();
  const canCreate = can(session.orgRole, "email_templates:create");
  const canDelete = can(session.orgRole, "email_templates:delete");

  const { data: templates } = await supabase
    .from("email_templates")
    .select("id, name, subject, category, is_system, merge_fields, created_at")
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("category")
    .order("is_system", { ascending: false })
    .order("name");

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Email Templates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage email templates used for candidate communications.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/settings/email-templates/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New Template
          </Link>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {templates && templates.length > 0 ? (
          templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/settings/email-templates/${tpl.id}`}
                    className="text-sm font-medium hover:text-primary"
                  >
                    {tpl.name}
                  </Link>
                  {tpl.is_system && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      System
                    </span>
                  )}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {categoryLabels[tpl.category] ?? tpl.category}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {tpl.subject}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/settings/email-templates/${tpl.id}`}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Edit
                </Link>
                {canDelete && !tpl.is_system && (
                  <DeleteEmailTemplateButton
                    templateId={tpl.id}
                    templateName={tpl.name}
                  />
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No email templates yet.
            </p>
            {canCreate && (
              <Link
                href="/settings/email-templates/new"
                className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
              >
                Create your first template
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
