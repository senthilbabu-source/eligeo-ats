"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import * as Sentry from "@sentry/nextjs";
import logger from "@/lib/utils/logger";
import { z } from "zod/v4";
import {
  computeScorecardSummary,
  type RawSubmission,
  type RawRating,
  type RawAttribute,
  type RawCategory,
} from "@/lib/scoring";
import type { ScorecardSummary } from "@/lib/types/ground-truth";

// ── Validation Schemas ─────────────────────────────────────

const ratingSchema = z.object({
  attribute_id: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  notes: z.string().max(2000).optional(),
});

const submitScorecardSchema = z.object({
  interviewId: z.string().uuid(),
  applicationId: z.string().uuid(),
  overallRecommendation: z.enum(["strong_no", "no", "yes", "strong_yes"]),
  overallNotes: z.string().max(5000).optional(),
  ratings: z.array(ratingSchema).min(1),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().default(false),
  categories: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        position: z.coerce.number().int().min(0),
        weight: z.coerce.number().positive().default(1.0),
        attributes: z.array(
          z.object({
            name: z.string().min(1).max(255),
            description: z.string().max(500).optional(),
            position: z.coerce.number().int().min(0),
          }),
        ),
      }),
    )
    .min(1),
});

// ── Submit Scorecard ───────────────────────────────────────

export async function submitScorecard(input: {
  interviewId: string;
  applicationId: string;
  overallRecommendation: string;
  overallNotes?: string;
  ratings: Array<{ attribute_id: string; rating: number; notes?: string }>;
}) {
  const session = await requireAuth();
  assertCan(session.orgRole, "scorecards:submit");

  const parsed = submitScorecardSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid scorecard data. Please check all fields." };
  }

  const data = parsed.data;
  const supabase = await createClient();

  // Insert submission
  const { data: submission, error: subErr } = await supabase
    .from("scorecard_submissions")
    .insert({
      organization_id: session.orgId,
      interview_id: data.interviewId,
      application_id: data.applicationId,
      submitted_by: session.userId,
      overall_recommendation: data.overallRecommendation,
      overall_notes: data.overallNotes,
    })
    .select("id")
    .single();

  if (subErr) {
    if (subErr.code === "23505") {
      return { error: "You have already submitted a scorecard for this interview." };
    }
    logger.error({ error: subErr }, "Failed to submit scorecard");
    Sentry.captureException(subErr);
    return { error: "Failed to submit scorecard." };
  }

  // Insert ratings
  const ratingRows = data.ratings.map((r) => ({
    submission_id: submission.id,
    attribute_id: r.attribute_id,
    organization_id: session.orgId,
    rating: r.rating,
    notes: r.notes,
  }));

  const { error: ratErr } = await supabase
    .from("scorecard_ratings")
    .insert(ratingRows);

  if (ratErr) {
    logger.error({ error: ratErr }, "Failed to insert scorecard ratings");
    Sentry.captureException(ratErr);
    // Submission exists but ratings failed — log but don't return error
    // (submission can be updated later)
  }

  // Auto-complete interview if still in confirmed/scheduled state
  await supabase
    .from("interviews")
    .update({ status: "completed" })
    .eq("id", data.interviewId)
    .eq("organization_id", session.orgId)
    .in("status", ["scheduled", "confirmed"]);

  revalidatePath(`/candidates`);
  revalidatePath(`/jobs`);

  return { success: true, submissionId: submission.id };
}

// ── Update Submission ──────────────────────────────────────

export async function updateSubmission(input: {
  submissionId: string;
  overallRecommendation?: string;
  overallNotes?: string;
}) {
  const session = await requireAuth();
  assertCan(session.orgRole, "scorecards:submit");

  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  if (input.overallRecommendation !== undefined)
    updates.overall_recommendation = input.overallRecommendation;
  if (input.overallNotes !== undefined)
    updates.overall_notes = input.overallNotes;

  if (Object.keys(updates).length === 0) {
    return { error: "No changes provided." };
  }

  const { data, error } = await supabase
    .from("scorecard_submissions")
    .update(updates)
    .eq("id", input.submissionId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Failed to update submission." };
  }

  revalidatePath(`/candidates`);

  return { success: true };
}

// ── Get Scorecard Summary for Application ──────────────────

export async function getScorecardSummary(
  applicationId: string,
): Promise<{ success: true; data: ScorecardSummary } | { error: string }> {
  const session = await requireAuth();
  assertCan(session.orgRole, "scorecards:view");

  const supabase = await createClient();

  // Fetch submissions (RLS enforces blind review)
  const { data: submissions, error: subErr } = await supabase
    .from("scorecard_submissions")
    .select("id, submitted_by, overall_recommendation")
    .eq("application_id", applicationId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (subErr) {
    logger.error({ error: subErr }, "Failed to fetch scorecard submissions");
    return { error: "Failed to load scorecard data." };
  }

  if (!submissions || submissions.length === 0) {
    return {
      success: true,
      data: {
        application_id: applicationId,
        total_submissions: 0,
        recommendations: { strong_yes: 0, yes: 0, no: 0, strong_no: 0 },
        weighted_overall: null,
        categories: [],
      },
    };
  }

  // Fetch submitter names
  const submitterIds = submissions.map((s) => s.submitted_by);
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .in("id", submitterIds);

  const nameMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]),
  );

  // Fetch ratings for these submissions
  const submissionIds = submissions.map((s) => s.id);
  const { data: ratings, error: ratErr } = await supabase
    .from("scorecard_ratings")
    .select("submission_id, attribute_id, rating, notes")
    .in("submission_id", submissionIds)
    .is("deleted_at", null);

  if (ratErr) {
    logger.error({ error: ratErr }, "Failed to fetch scorecard ratings");
    return { error: "Failed to load ratings." };
  }

  // Fetch attribute + category metadata
  // Pre-fetch attribute IDs to get categories
  const attrIds = [...new Set((ratings ?? []).map((r) => r.attribute_id))];

  const { data: attributes } = await supabase
    .from("scorecard_attributes")
    .select("id, name, category_id")
    .in("id", attrIds)
    .is("deleted_at", null);

  const catIds = [
    ...new Set((attributes ?? []).map((a) => a.category_id)),
  ];

  const { data: categories } = await supabase
    .from("scorecard_categories")
    .select("id, name, weight")
    .in("id", catIds)
    .is("deleted_at", null);

  // Compute summary using pure scoring utility
  const rawSubmissions: RawSubmission[] = submissions.map((s) => ({
    id: s.id,
    submitted_by: s.submitted_by,
    submitter_name: nameMap.get(s.submitted_by) ?? "Unknown",
    overall_recommendation: s.overall_recommendation as RawSubmission["overall_recommendation"],
  }));

  const rawRatings: RawRating[] = (ratings ?? []).map((r) => ({
    submission_id: r.submission_id,
    attribute_id: r.attribute_id,
    rating: r.rating,
    notes: r.notes,
  }));

  const rawAttributes: RawAttribute[] = (attributes ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    category_id: a.category_id,
  }));

  const rawCategories: RawCategory[] = (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    weight: c.weight,
  }));

  const summary = computeScorecardSummary(
    applicationId,
    rawSubmissions,
    rawRatings,
    rawAttributes,
    rawCategories,
  );

  return { success: true, data: summary };
}

// ── Scorecard Template CRUD ────────────────────────────────

export async function createScorecardTemplate(input: {
  name: string;
  description?: string;
  isDefault?: boolean;
  categories: Array<{
    name: string;
    position: number;
    weight?: number;
    attributes: Array<{
      name: string;
      description?: string;
      position: number;
    }>;
  }>;
}) {
  const session = await requireAuth();
  assertCan(session.orgRole, "interviews:create");

  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid template data." };
  }

  const data = parsed.data;
  const supabase = await createClient();

  // Insert template
  const { data: template, error: tErr } = await supabase
    .from("scorecard_templates")
    .insert({
      organization_id: session.orgId,
      name: data.name,
      description: data.description,
      is_default: data.isDefault,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (tErr) {
    if (tErr.code === "23505") {
      return { error: "A default template already exists. Unset it first." };
    }
    logger.error({ error: tErr }, "Failed to create scorecard template");
    Sentry.captureException(tErr);
    return { error: "Failed to create template." };
  }

  // Insert categories + attributes
  for (const cat of data.categories) {
    const { data: catRow, error: catErr } = await supabase
      .from("scorecard_categories")
      .insert({
        template_id: template.id,
        organization_id: session.orgId,
        name: cat.name,
        position: cat.position,
        weight: cat.weight,
      })
      .select("id")
      .single();

    if (catErr || !catRow) {
      logger.error({ error: catErr }, "Failed to create scorecard category");
      continue;
    }

    if (cat.attributes.length > 0) {
      const attrRows = cat.attributes.map((attr) => ({
        category_id: catRow.id,
        organization_id: session.orgId,
        name: attr.name,
        description: attr.description,
        position: attr.position,
      }));

      const { error: attrErr } = await supabase
        .from("scorecard_attributes")
        .insert(attrRows);

      if (attrErr) {
        logger.error(
          { error: attrErr },
          "Failed to create scorecard attributes",
        );
      }
    }
  }

  revalidatePath(`/settings`);

  return { success: true, id: template.id };
}

export async function getScorecardTemplates() {
  const session = await requireAuth();
  assertCan(session.orgRole, "interviews:view");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scorecard_templates")
    .select("id, name, description, is_default, created_at")
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error({ error }, "Failed to fetch scorecard templates");
    return { error: "Failed to load templates." };
  }

  return { success: true, data: data ?? [] };
}

export async function getScorecardTemplateDetail(templateId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "interviews:view");

  const supabase = await createClient();

  // Fetch template
  const { data: template, error: tErr } = await supabase
    .from("scorecard_templates")
    .select("id, name, description, is_default, created_at")
    .eq("id", templateId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (tErr || !template) {
    return { error: "Template not found." };
  }

  // Fetch categories
  const { data: categories } = await supabase
    .from("scorecard_categories")
    .select("id, name, position, weight")
    .eq("template_id", templateId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  // Fetch attributes for all categories
  const catIds = (categories ?? []).map((c) => c.id);
  const { data: attributes } = await supabase
    .from("scorecard_attributes")
    .select("id, name, description, position, category_id")
    .in("category_id", catIds)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  // Group attributes by category
  const attrByCat = new Map<string, typeof attributes>();
  for (const attr of attributes ?? []) {
    const existing = attrByCat.get(attr.category_id) ?? [];
    existing.push(attr);
    attrByCat.set(attr.category_id, existing);
  }

  const categoriesWithAttrs = (categories ?? []).map((cat) => ({
    ...cat,
    attributes: attrByCat.get(cat.id) ?? [],
  }));

  return {
    success: true,
    data: {
      ...template,
      categories: categoriesWithAttrs,
    },
  };
}

export async function deleteScorecardTemplate(templateId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "interviews:create");

  const supabase = await createClient();

  // Soft-delete template (ADR-006)
  const { error } = await supabase
    .from("scorecard_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (error) {
    logger.error({ error }, "Failed to delete scorecard template");
    return { error: "Failed to delete template." };
  }

  // Soft-delete child categories and attributes
  const { data: categories } = await supabase
    .from("scorecard_categories")
    .select("id")
    .eq("template_id", templateId)
    .is("deleted_at", null);

  if (categories && categories.length > 0) {
    const catIds = categories.map((c) => c.id);

    await supabase
      .from("scorecard_attributes")
      .update({ deleted_at: new Date().toISOString() })
      .in("category_id", catIds)
      .is("deleted_at", null);

    await supabase
      .from("scorecard_categories")
      .update({ deleted_at: new Date().toISOString() })
      .eq("template_id", templateId)
      .is("deleted_at", null);
  }

  revalidatePath(`/settings`);

  return { success: true };
}
