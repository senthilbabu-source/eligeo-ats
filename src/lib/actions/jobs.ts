"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { z } from "zod/v4";

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
