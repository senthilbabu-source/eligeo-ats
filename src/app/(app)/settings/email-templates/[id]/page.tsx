import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { EmailTemplateEditor } from "./email-template-editor";

export default async function EmailTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();
  const supabase = await createClient();
  const canEdit = can(session.orgRole, "email_templates:edit");

  const { data: template } = await supabase
    .from("email_templates")
    .select("id, name, subject, body_html, body_text, category, merge_fields, is_system")
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!template) notFound();

  return (
    <div>
      <Link
        href="/settings/email-templates"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back to Email Templates
      </Link>
      <h2 className="mt-4 text-lg font-semibold">{template.name}</h2>
      {template.is_system && (
        <p className="mt-1 text-xs text-muted-foreground">
          System templates can be customized but not deleted.
        </p>
      )}
      <div className="mt-6">
        <EmailTemplateEditor
          template={{
            id: template.id,
            name: template.name,
            subject: template.subject,
            body_html: template.body_html,
            body_text: template.body_text ?? "",
            category: template.category,
            merge_fields: (template.merge_fields as string[]) ?? [],
          }}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}
