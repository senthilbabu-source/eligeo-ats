"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { z } from "zod/v4";
import {
  generateAndStoreEmbedding,
  buildJobEmbeddingText,
} from "@/lib/ai/embeddings";
import type { CloneIntent } from "@/lib/types/ground-truth";

// ── Validation Schemas ─────────────────────────────────────

const createJobSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  department: z.string().optional(),
  location: z.string().optional(),
  locationType: z.enum(["on_site", "remote", "hybrid"]),
  employmentType: z.enum([
    "full_time",
    "part_time",
    "contract",
    "internship",
    "freelance",
  ]),
  salaryMin: z.coerce.number().positive().optional(),
  salaryMax: z.coerce.number().positive().optional(),
  salaryCurrency: z.string().default("USD"),
  headcount: z.coerce.number().int().positive().default(1),
  pipelineTemplateId: z.string().uuid(),
});

const updateJobSchema = createJobSchema.partial().extend({
  id: z.string().uuid(),
});

// ── Helpers ────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Find the next available slug for an org, using numeric suffixes on collision.
 * e.g. "senior-engineer" → "senior-engineer-2" → "senior-engineer-3"
 * Exported for unit testing.
 */
export async function findAvailableSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  baseSlug: string,
): Promise<string> {
  const { data } = await supabase
    .from("job_openings")
    .select("slug")
    .eq("organization_id", orgId)
    .or(`slug.eq.${baseSlug},slug.like.${baseSlug}-%`)
    .is("deleted_at", null);

  if (!data || data.length === 0) return baseSlug;

  const existing = new Set(data.map((r: { slug: string }) => r.slug));
  if (!existing.has(baseSlug)) return baseSlug;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }

  return `${baseSlug}-${Date.now()}`; // extreme fallback: >99 clones of same title
}

// ── Create Job ─────────────────────────────────────────────

export async function createJob(_prev: unknown, formData: FormData) {
  const session = await requireAuth();
  assertCan(session.orgRole, "jobs:create");

  const parsed = createJobSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    department: formData.get("department"),
    location: formData.get("location"),
    locationType: formData.get("locationType") || "on_site",
    employmentType: formData.get("employmentType") || "full_time",
    salaryMin: formData.get("salaryMin") || undefined,
    salaryMax: formData.get("salaryMax") || undefined,
    salaryCurrency: formData.get("salaryCurrency") || "USD",
    headcount: formData.get("headcount") || 1,
    pipelineTemplateId: formData.get("pipelineTemplateId"),
  });

  if (!parsed.success) {
    return { error: "Invalid input. Please check all fields." };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("job_openings")
    .insert({
      organization_id: session.orgId,
      pipeline_template_id: data.pipelineTemplateId,
      title: data.title,
      slug: slugify(data.title),
      description: data.description,
      department: data.department,
      location: data.location,
      location_type: data.locationType,
      employment_type: data.employmentType,
      salary_min: data.salaryMin,
      salary_max: data.salaryMax,
      salary_currency: data.salaryCurrency,
      headcount: data.headcount,
      status: "draft",
    })
    .select("id, slug")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A job with this title already exists" };
    }
    return { error: "Failed to create job" };
  }

  revalidatePath("/jobs");
  return { success: true, id: job.id, slug: job.slug };
}

// ── Update Job ─────────────────────────────────────────────

export async function updateJob(formData: FormData) {
  const session = await requireAuth();
  assertCan(session.orgRole, "jobs:edit");

  const parsed = updateJobSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title") || undefined,
    description: formData.get("description") || undefined,
    department: formData.get("department") || undefined,
    location: formData.get("location") || undefined,
    locationType: formData.get("locationType") || undefined,
    employmentType: formData.get("employmentType") || undefined,
    salaryMin: formData.get("salaryMin") || undefined,
    salaryMax: formData.get("salaryMax") || undefined,
    headcount: formData.get("headcount") || undefined,
    pipelineTemplateId: formData.get("pipelineTemplateId") || undefined,
  });

  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const { id, ...updates } = parsed.data;
  const supabase = await createClient();

  // Build update object, mapping camelCase to snake_case
  const dbUpdates: Record<string, unknown> = {};
  if (updates.title) {
    dbUpdates.title = updates.title;
    dbUpdates.slug = slugify(updates.title);
  }
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.department !== undefined) dbUpdates.department = updates.department;
  if (updates.location !== undefined) dbUpdates.location = updates.location;
  if (updates.locationType) dbUpdates.location_type = updates.locationType;
  if (updates.employmentType) dbUpdates.employment_type = updates.employmentType;
  if (updates.salaryMin !== undefined) dbUpdates.salary_min = updates.salaryMin;
  if (updates.salaryMax !== undefined) dbUpdates.salary_max = updates.salaryMax;
  if (updates.headcount !== undefined) dbUpdates.headcount = updates.headcount;
  if (updates.pipelineTemplateId) dbUpdates.pipeline_template_id = updates.pipelineTemplateId;

  const { error } = await supabase
    .from("job_openings")
    .update(dbUpdates)
    .eq("id", id)
    .eq("organization_id", session.orgId);

  if (error) {
    return { error: "Failed to update job" };
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  return { success: true };
}

// ── Publish Job ────────────────────────────────────────────

export async function publishJob(jobId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "jobs:publish");

  const supabase = await createClient();
  const { error } = await supabase
    .from("job_openings")
    .update({ status: "open", published_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("organization_id", session.orgId)
    .in("status", ["draft", "paused"]);

  if (error) {
    return { error: "Failed to publish job" };
  }

  revalidatePath("/jobs");
  return { success: true };
}

// ── Close Job ──────────────────────────────────────────────

export async function closeJob(jobId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "jobs:edit");

  const supabase = await createClient();
  const { error } = await supabase
    .from("job_openings")
    .update({ status: "closed" })
    .eq("id", jobId)
    .eq("organization_id", session.orgId)
    .in("status", ["open", "paused"]);

  if (error) {
    return { error: "Failed to close job" };
  }

  revalidatePath("/jobs");
  return { success: true };
}

// ── Clone Job ──────────────────────────────────────────────

export async function cloneJob(jobId: string, intent?: CloneIntent | null) {
  const session = await requireAuth();
  assertCan(session.orgRole, "jobs:create");

  const supabase = await createClient();

  // 1. Fetch source job (org-scoped — prevents cross-tenant clone)
  const { data: source } = await supabase
    .from("job_openings")
    .select(
      "title, description, department, location, location_type, employment_type, salary_min, salary_max, salary_currency, headcount, pipeline_template_id, hiring_manager_id, recruiter_id",
    )
    .eq("id", jobId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!source) {
    return { error: "Job not found." };
  }

  // 2. Fetch required skills from source (these feed AI matching)
  const { data: sourceSkills } = await supabase
    .from("job_required_skills")
    .select("skill_id, importance")
    .eq("job_id", jobId)
    .is("deleted_at", null);

  // 3. Find a clean, collision-safe slug (no timestamp, no "(Copy)")
  const slug = await findAvailableSlug(supabase, session.orgId, slugify(source.title));

  // 4. Insert the cloned job
  const { data: clone, error } = await supabase
    .from("job_openings")
    .insert({
      organization_id: session.orgId,
      pipeline_template_id: source.pipeline_template_id,
      title: source.title,
      slug,
      description: source.description,
      department: source.department,
      location: source.location,
      location_type: source.location_type,
      employment_type: source.employment_type,
      salary_min: source.salary_min,
      salary_max: source.salary_max,
      salary_currency: source.salary_currency,
      headcount: source.headcount,
      hiring_manager_id: source.hiring_manager_id,
      recruiter_id: source.recruiter_id,
      status: "draft",
      metadata: intent ? { clone_intent: intent } : {},
    })
    .select("id")
    .single();

  if (error) {
    return { error: "Failed to clone job." };
  }

  // 5. Copy required skills to the cloned job
  if (sourceSkills && sourceSkills.length > 0) {
    const skillRows = sourceSkills.map((s) => ({
      organization_id: session.orgId,
      job_id: clone.id,
      skill_id: s.skill_id,
      importance: s.importance,
    }));
    await supabase.from("job_required_skills").insert(skillRows);
  }

  // 6. Queue embedding generation (non-blocking — failure doesn't fail the clone).
  // Uses title + description only; recruiter can regenerate via "Generate Embedding"
  // after updating skills for full accuracy. TODO: move to Inngest when first function is wired.
  const embeddingText = buildJobEmbeddingText({
    title: source.title,
    description: source.description,
  });
  void generateAndStoreEmbedding({
    organizationId: session.orgId,
    userId: session.userId,
    entityType: "job_opening",
    entityId: clone.id,
    text: embeddingText,
  }).catch((err: unknown) =>
    Sentry.captureException(err, { extra: { jobId: clone.id, context: "post-clone-embedding" } }),
  );

  revalidatePath("/jobs");
  return { success: true, id: clone.id };
}

// ── AI Rewrite Job Description ─────────────────────────────

export async function rewriteJobDescription(jobId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "jobs:edit");

  const supabase = await createClient();

  const { data: job } = await supabase
    .from("job_openings")
    .select("title, department, description")
    .eq("id", jobId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!job) {
    return { error: "Job not found." };
  }

  const { generateJobDescription } = await import("@/lib/ai/generate");

  const result = await generateJobDescription({
    title: job.title,
    department: job.department ?? undefined,
    keyPoints: job.description
      ? `Existing description (improve and expand on this):\n${job.description.slice(0, 500)}`
      : undefined,
    organizationId: session.orgId,
    userId: session.userId,
  });

  if (result.error || !result.text) {
    return { error: result.error ?? "AI generation failed." };
  }

  // Store the original before overwriting so the recruiter can revert.
  const { error: updateError } = await supabase
    .from("job_openings")
    .update({ description: result.text, description_previous: job.description })
    .eq("id", jobId)
    .eq("organization_id", session.orgId);

  if (updateError) {
    return { error: "Failed to save new description." };
  }

  revalidatePath(`/jobs/${jobId}`);
  return { success: true };
}

// ── Delete Job (soft delete) ───────────────────────────────

export async function deleteJob(jobId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "jobs:delete");

  const supabase = await createClient();
  const { error } = await supabase
    .from("job_openings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("organization_id", session.orgId);

  if (error) {
    return { error: "Failed to delete job" };
  }

  revalidatePath("/jobs");
  return { success: true };
}
