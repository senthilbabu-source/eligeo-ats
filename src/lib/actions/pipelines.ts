"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { z } from "zod/v4";
import logger from "@/lib/utils/logger";
import * as Sentry from "@sentry/nextjs";

// ── Validation Schemas ─────────────────────────────────────

const STAGE_TYPES = [
  "sourced",
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
] as const;

const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
});

const updateTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
});

const addStageSchema = z.object({
  pipelineTemplateId: z.string().uuid(),
  name: z.string().min(1, "Stage name is required").max(100),
  stageType: z.enum(STAGE_TYPES),
  isTerminal: z.boolean().default(false),
});

const updateStageSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  stageType: z.enum(STAGE_TYPES).optional(),
  isTerminal: z.boolean().optional(),
});

const reorderStagesSchema = z.object({
  pipelineTemplateId: z.string().uuid(),
  stageIds: z.array(z.string().uuid()).min(1),
});

// ── Create Pipeline Template ───────────────────────────────

export async function createPipelineTemplate(
  _prev: unknown,
  formData: FormData,
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "pipelines:create");

  const parsed = createTemplateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return { error: "Invalid input. Please check all fields." };
  }

  const supabase = await createClient();

  // Check if this is the first template (auto-set as default)
  const { count } = await supabase
    .from("pipeline_templates")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  const isDefault = count === 0;

  const { data: template, error } = await supabase
    .from("pipeline_templates")
    .insert({
      organization_id: session.orgId,
      name: parsed.data.name,
      description: parsed.data.description,
      is_default: isDefault,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A pipeline template with this name already exists" };
    }
    logger.error({ error }, "Failed to create pipeline template");
    Sentry.captureException(error);
    return { error: "Failed to create pipeline template" };
  }

  revalidatePath("/settings/pipelines");
  return { success: true, id: template.id };
}

// ── Update Pipeline Template ───────────────────────────────

export async function updatePipelineTemplate(
  id: string,
  updates: { name?: string; description?: string; isDefault?: boolean },
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "pipelines:create");

  const parsed = updateTemplateSchema.safeParse({ id, ...updates });
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const supabase = await createClient();
  const dbUpdates: Record<string, unknown> = {};
  if (parsed.data.name) dbUpdates.name = parsed.data.name;
  if (parsed.data.description !== undefined)
    dbUpdates.description = parsed.data.description;

  // Handle setting as default (unset other defaults first)
  if (parsed.data.isDefault) {
    await supabase
      .from("pipeline_templates")
      .update({ is_default: false })
      .eq("organization_id", session.orgId)
      .is("deleted_at", null);

    dbUpdates.is_default = true;
  }

  const { error } = await supabase
    .from("pipeline_templates")
    .update(dbUpdates)
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (error) {
    if (error.code === "23505") {
      return { error: "A pipeline template with this name already exists" };
    }
    logger.error({ error }, "Failed to update pipeline template");
    Sentry.captureException(error);
    return { error: "Failed to update pipeline template" };
  }

  revalidatePath("/settings/pipelines");
  revalidatePath(`/settings/pipelines/${id}`);
  return { success: true };
}

// ── Delete Pipeline Template (soft delete) ─────────────────

export async function deletePipelineTemplate(id: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "pipelines:create");

  const supabase = await createClient();

  // Check if any active jobs reference this template
  const { count } = await supabase
    .from("job_openings")
    .select("id", { count: "exact", head: true })
    .eq("pipeline_template_id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (count && count > 0) {
    return {
      error: `Cannot delete: ${count} active job(s) use this pipeline template`,
    };
  }

  const { error } = await supabase
    .from("pipeline_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (error) {
    logger.error({ error }, "Failed to delete pipeline template");
    Sentry.captureException(error);
    return { error: "Failed to delete pipeline template" };
  }

  revalidatePath("/settings/pipelines");
  return { success: true };
}

// ── Add Stage ──────────────────────────────────────────────

export async function addStage(
  _prev: unknown,
  formData: FormData,
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "pipelines:create");

  const parsed = addStageSchema.safeParse({
    pipelineTemplateId: formData.get("pipelineTemplateId"),
    name: formData.get("name"),
    stageType: formData.get("stageType"),
    isTerminal: formData.get("isTerminal") === "true",
  });

  if (!parsed.success) {
    return { error: "Invalid input. Please check all fields." };
  }

  const supabase = await createClient();

  // Get the max stage_order for this template
  const { data: existing } = await supabase
    .from("pipeline_stages")
    .select("stage_order")
    .eq("pipeline_template_id", parsed.data.pipelineTemplateId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("stage_order", { ascending: false })
    .limit(1);

  const nextOrder = existing?.[0]?.stage_order != null ? existing[0].stage_order + 1 : 0;

  const { data: stage, error } = await supabase
    .from("pipeline_stages")
    .insert({
      organization_id: session.orgId,
      pipeline_template_id: parsed.data.pipelineTemplateId,
      name: parsed.data.name,
      stage_type: parsed.data.stageType,
      stage_order: nextOrder,
      is_terminal: parsed.data.isTerminal,
    })
    .select("id")
    .single();

  if (error) {
    logger.error({ error }, "Failed to add stage");
    Sentry.captureException(error);
    return { error: "Failed to add stage" };
  }

  revalidatePath(`/settings/pipelines/${parsed.data.pipelineTemplateId}`);
  return { success: true, id: stage.id };
}

// ── Update Stage ───────────────────────────────────────────

export async function updateStage(
  id: string,
  updates: { name?: string; stageType?: string; isTerminal?: boolean },
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "pipelines:create");

  const parsed = updateStageSchema.safeParse({ id, ...updates });
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const supabase = await createClient();
  const dbUpdates: Record<string, unknown> = {};
  if (parsed.data.name) dbUpdates.name = parsed.data.name;
  if (parsed.data.stageType) dbUpdates.stage_type = parsed.data.stageType;
  if (parsed.data.isTerminal !== undefined)
    dbUpdates.is_terminal = parsed.data.isTerminal;

  const { error } = await supabase
    .from("pipeline_stages")
    .update(dbUpdates)
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (error) {
    logger.error({ error }, "Failed to update stage");
    Sentry.captureException(error);
    return { error: "Failed to update stage" };
  }

  // Get template id for path revalidation
  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("pipeline_template_id")
    .eq("id", id)
    .single();

  if (stage) {
    revalidatePath(`/settings/pipelines/${stage.pipeline_template_id}`);
  }
  return { success: true };
}

// ── Remove Stage (soft delete) ─────────────────────────────

export async function removeStage(id: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "pipelines:create");

  const supabase = await createClient();

  // Get stage info before deleting
  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("pipeline_template_id")
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!stage) {
    return { error: "Stage not found" };
  }

  // Check if any active applications are in this stage
  const { count } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("current_stage_id", id)
    .eq("status", "active")
    .is("deleted_at", null);

  if (count && count > 0) {
    return {
      error: `Cannot remove: ${count} active application(s) in this stage. Move them first.`,
    };
  }

  const { error } = await supabase
    .from("pipeline_stages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (error) {
    logger.error({ error }, "Failed to remove stage");
    Sentry.captureException(error);
    return { error: "Failed to remove stage" };
  }

  revalidatePath(`/settings/pipelines/${stage.pipeline_template_id}`);
  return { success: true };
}

// ── Reorder Stages ─────────────────────────────────────────

export async function reorderStages(
  pipelineTemplateId: string,
  stageIds: string[],
) {
  const session = await requireAuth();
  assertCan(session.orgRole, "pipelines:create");

  const parsed = reorderStagesSchema.safeParse({
    pipelineTemplateId,
    stageIds,
  });

  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const supabase = await createClient();

  // Update each stage's order in sequence
  for (let i = 0; i < parsed.data.stageIds.length; i++) {
    const { error } = await supabase
      .from("pipeline_stages")
      .update({ stage_order: i })
      .eq("id", parsed.data.stageIds[i])
      .eq("pipeline_template_id", pipelineTemplateId)
      .eq("organization_id", session.orgId)
      .is("deleted_at", null);

    if (error) {
      logger.error({ error, stageId: parsed.data.stageIds[i] }, "Failed to reorder stage");
      Sentry.captureException(error);
      return { error: "Failed to reorder stages" };
    }
  }

  revalidatePath(`/settings/pipelines/${pipelineTemplateId}`);
  return { success: true };
}
