"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import * as Sentry from "@sentry/nextjs";
import logger from "@/lib/utils/logger";
import { z } from "zod/v4";
import { renderTemplate } from "@/lib/notifications/render-template";
import type {
  EmailTemplateCategory,
  NotificationChannel,
} from "@/lib/types/ground-truth";

// ── Validation Schemas ─────────────────────────────────────

const emailTemplateCategoryValues = [
  "interview_invite",
  "rejection",
  "offer",
  "follow_up",
  "nurture",
  "custom",
] as const;

const createEmailTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  subject: z.string().min(1).max(200),
  body_html: z.string().min(1),
  body_text: z.string().optional(),
  category: z.enum(emailTemplateCategoryValues),
  merge_fields: z.array(z.string()).default([]),
});

const updateEmailTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  subject: z.string().min(1).max(200).optional(),
  body_html: z.string().min(1).optional(),
  body_text: z.string().optional(),
  category: z.enum(emailTemplateCategoryValues).optional(),
  merge_fields: z.array(z.string()).optional(),
});

const previewTemplateSchema = z.object({
  templateId: z.string().uuid(),
  variables: z.record(z.string(), z.unknown()),
});

const setNotificationPrefSchema = z.object({
  event_type: z.string().min(1).max(100),
  channel: z.enum(["in_app", "email", "both", "none"]),
});

// ── Email Template Actions ─────────────────────────────────

export async function listEmailTemplates(category?: EmailTemplateCategory) {
  const session = await requireAuth();
  assertCan(session.orgRole, "email_templates:view");

  const supabase = await createClient();

  let query = supabase
    .from("email_templates")
    .select("id, name, subject, category, merge_fields, is_system, created_at, updated_at")
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("category")
    .order("is_system", { ascending: false })
    .order("name");

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ error }, "listEmailTemplates failed");
    Sentry.captureException(error);
    return { error: "Failed to load email templates." };
  }

  return { data };
}

export async function getEmailTemplate(id: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "email_templates:view");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logger.error({ error }, "getEmailTemplate failed");
    Sentry.captureException(error);
    return { error: "Failed to load email template." };
  }

  if (!data) {
    return { error: "Email template not found." };
  }

  return { data };
}

export async function createEmailTemplate(input: {
  name: string;
  subject: string;
  body_html: string;
  body_text?: string;
  category: string;
  merge_fields?: string[];
}) {
  const session = await requireAuth();
  assertCan(session.orgRole, "email_templates:create");

  const parsed = createEmailTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid template data. Please check all fields." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      organization_id: session.orgId,
      name: parsed.data.name,
      subject: parsed.data.subject,
      body_html: parsed.data.body_html,
      body_text: parsed.data.body_text,
      category: parsed.data.category,
      merge_fields: parsed.data.merge_fields,
      is_system: false,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) {
    logger.error({ error }, "createEmailTemplate failed");
    Sentry.captureException(error);
    return { error: "Failed to create email template." };
  }

  revalidatePath("/settings/email-templates");
  return { data };
}

export async function updateEmailTemplate(input: {
  id: string;
  name?: string;
  subject?: string;
  body_html?: string;
  body_text?: string;
  category?: string;
  merge_fields?: string[];
}) {
  const session = await requireAuth();
  assertCan(session.orgRole, "email_templates:edit");

  const parsed = updateEmailTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid template data. Please check all fields." };
  }

  const { id, ...updates } = parsed.data;

  // Remove undefined values
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined),
  );

  if (Object.keys(cleanUpdates).length === 0) {
    return { error: "No fields to update." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("email_templates")
    .update(cleanUpdates)
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .select("id")
    .single();

  if (error) {
    logger.error({ error }, "updateEmailTemplate failed");
    Sentry.captureException(error);
    return { error: "Failed to update email template." };
  }

  if (!data) {
    return { error: "Template not found or access denied." };
  }

  revalidatePath("/settings/email-templates");
  return { data };
}

export async function deleteEmailTemplate(id: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "email_templates:delete");

  const supabase = await createClient();

  // Check if it's a system template (RLS also blocks this, but give a clear error)
  const { data: template } = await supabase
    .from("email_templates")
    .select("id, is_system")
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!template) {
    return { error: "Template not found." };
  }

  if (template.is_system) {
    return { error: "System templates cannot be deleted." };
  }

  // Soft delete
  const { error } = await supabase
    .from("email_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", session.orgId);

  if (error) {
    logger.error({ error }, "deleteEmailTemplate failed");
    Sentry.captureException(error);
    return { error: "Failed to delete email template." };
  }

  revalidatePath("/settings/email-templates");
  return { success: true };
}

export async function previewEmailTemplate(input: {
  templateId: string;
  variables: Record<string, unknown>;
}) {
  const session = await requireAuth();
  assertCan(session.orgRole, "email_templates:view");

  const parsed = previewTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid preview request." };
  }

  const supabase = await createClient();

  const { data: template } = await supabase
    .from("email_templates")
    .select("subject, body_html, body_text")
    .eq("id", parsed.data.templateId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!template) {
    return { error: "Template not found." };
  }

  const renderedSubject = renderTemplate(
    template.subject,
    parsed.data.variables,
    { escapeValues: false },
  );
  const renderedHtml = renderTemplate(
    template.body_html,
    parsed.data.variables,
  );
  const renderedText = template.body_text
    ? renderTemplate(template.body_text, parsed.data.variables, {
        escapeValues: false,
      })
    : undefined;

  return {
    data: {
      subject: renderedSubject,
      body_html: renderedHtml,
      body_text: renderedText,
    },
  };
}

// ── Notification Preference Actions ────────────────────────

export async function getNotificationPreferences() {
  const session = await requireAuth();
  assertCan(session.orgRole, "notifications:manage");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("id, event_type, channel")
    .eq("organization_id", session.orgId)
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .order("event_type");

  if (error) {
    logger.error({ error }, "getNotificationPreferences failed");
    Sentry.captureException(error);
    return { error: "Failed to load notification preferences." };
  }

  return { data };
}

export async function setNotificationPreference(input: {
  event_type: string;
  channel: NotificationChannel;
}) {
  const session = await requireAuth();
  assertCan(session.orgRole, "notifications:manage");

  const parsed = setNotificationPrefSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid preference data." };
  }

  const supabase = await createClient();

  // Upsert: use the unique constraint (user_id, event_type)
  const { error } = await supabase.from("notification_preferences").upsert(
    {
      organization_id: session.orgId,
      user_id: session.userId,
      event_type: parsed.data.event_type,
      channel: parsed.data.channel,
    },
    { onConflict: "user_id,event_type" },
  );

  if (error) {
    logger.error({ error }, "setNotificationPreference failed");
    Sentry.captureException(error);
    return { error: "Failed to update notification preference." };
  }

  revalidatePath("/settings/notifications");
  return { success: true };
}

export async function resetNotificationPreference(eventType: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "notifications:manage");

  const supabase = await createClient();

  // Soft delete the preference to revert to default
  const { error } = await supabase
    .from("notification_preferences")
    .update({ deleted_at: new Date().toISOString() })
    .eq("organization_id", session.orgId)
    .eq("user_id", session.userId)
    .eq("event_type", eventType);

  if (error) {
    logger.error({ error }, "resetNotificationPreference failed");
    Sentry.captureException(error);
    return { error: "Failed to reset notification preference." };
  }

  revalidatePath("/settings/notifications");
  return { success: true };
}
