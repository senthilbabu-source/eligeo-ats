"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { transition, type TransitionContext } from "@/lib/offers/state-machine";
import { inngest } from "@/inngest/client";
import * as Sentry from "@sentry/nextjs";
import logger from "@/lib/utils/logger";
import { recordInteraction } from "@/lib/utils/record-interaction";
import { z } from "zod";
import type { OfferStatus, OfferApprovalStatus } from "@/lib/types/ground-truth";
import { SUPPORTED_CURRENCIES } from "@/lib/types/ground-truth";

// ── Validation Schemas ─────────────────────────────────────

const compensationSchema = z.object({
  base_salary: z.number().positive(),
  currency: z.enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]]),
  period: z.enum(["annual", "monthly", "hourly"]),
  bonus_pct: z.number().min(0).max(100).optional(),
  bonus_amount: z.number().min(0).optional(),
  equity_shares: z.number().int().min(0).optional(),
  equity_type: z.enum(["options", "rsu", "phantom"]).optional(),
  equity_vesting: z.string().max(200).optional(),
  sign_on_bonus: z.number().min(0).optional(),
  relocation: z.number().min(0).optional(),
  other_benefits: z.array(z.string().max(200)).max(20).optional(),
});

const createOfferSchema = z.object({
  applicationId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  compensation: compensationSchema,
  startDate: z.string().date().optional(),
  expiryDate: z.string().date().optional(),
  terms: z.string().max(10000).optional(),
  esignProvider: z.enum(["dropbox_sign", "docusign"]).optional(),
  approvers: z
    .array(
      z.object({
        userId: z.string().uuid(),
        sequenceOrder: z.number().int().positive(),
      }),
    )
    .min(1),
});

const updateOfferSchema = z.object({
  id: z.string().uuid(),
  compensation: compensationSchema.optional(),
  startDate: z.string().date().optional().nullable(),
  expiryDate: z.string().date().optional().nullable(),
  terms: z.string().max(10000).optional().nullable(),
  esignProvider: z.enum(["dropbox_sign", "docusign"]).optional().nullable(),
});

// ── Helpers ────────────────────────────────────────────────

function revalidateOfferPaths() {
  revalidatePath("/offers");
  revalidatePath("/approvals");
  revalidatePath("/jobs");
}

/**
 * Build TransitionContext for an offer by querying its approvals.
 */
async function buildTransitionContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  offerId: string,
  orgId: string,
): Promise<TransitionContext> {
  const { data: offer } = await supabase
    .from("offers")
    .select("compensation, esign_provider, expiry_date")
    .eq("id", offerId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .single();

  const { data: approvals } = await supabase
    .from("offer_approvals")
    .select("status")
    .eq("offer_id", offerId)
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  const comp = offer?.compensation as Record<string, unknown> | null;
  const hasSalary = typeof comp?.base_salary === "number" && (comp.base_salary as number) > 0;
  const approvalStatuses = (approvals ?? []).map(
    (a) => a.status as OfferApprovalStatus,
  );

  return {
    hasCompensation: hasSalary,
    approverCount: approvalStatuses.length,
    allApproved:
      approvalStatuses.length > 0 &&
      approvalStatuses.every((s) => s === "approved"),
    anyRejected: approvalStatuses.some((s) => s === "rejected"),
    hasEsignProvider: !!offer?.esign_provider,
    expiryInFuture:
      !offer?.expiry_date || new Date(offer.expiry_date) > new Date(),
  };
}

// ── Create Offer ──────────────────────────────────────────

export async function createOffer(input: z.input<typeof createOfferSchema>) {
  const session = await requireAuth();
  assertCan(session.orgRole, "offers:create");

  const parsed = createOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input. Check all required fields." };
  }

  const data = parsed.data;
  const supabase = await createClient();

  // Resolve application → candidate_id + job_id (server-side, never trust client)
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, candidate_id, job_opening_id")
    .eq("id", data.applicationId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (appErr || !app) {
    return { error: "Application not found." };
  }

  // Insert offer
  const { data: offer, error } = await supabase
    .from("offers")
    .insert({
      organization_id: session.orgId,
      application_id: data.applicationId,
      candidate_id: app.candidate_id,
      job_id: app.job_opening_id,
      template_id: data.templateId ?? null,
      status: "draft" as OfferStatus,
      compensation: data.compensation,
      start_date: data.startDate ?? null,
      expiry_date: data.expiryDate ?? null,
      terms: data.terms ?? null,
      esign_provider: data.esignProvider ?? null,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) {
    logger.error({ error }, "Failed to create offer");
    Sentry.captureException(error);
    return { error: "Failed to create offer." };
  }

  // Insert approvals
  const approvalRows = data.approvers.map((a) => ({
    organization_id: session.orgId,
    offer_id: offer.id,
    approver_id: a.userId,
    sequence_order: a.sequenceOrder,
    status: "pending" as OfferApprovalStatus,
  }));

  const { error: approvalErr } = await supabase
    .from("offer_approvals")
    .insert(approvalRows);

  if (approvalErr) {
    logger.error({ error: approvalErr }, "Failed to create offer approvals");
    Sentry.captureException(approvalErr);
    // Offer was created but approvals failed — still return the offer
    return { success: true, id: offer.id, warning: "Offer created but approvals failed to save." };
  }

  // H3-1: Record offer creation on candidate timeline
  await recordInteraction(supabase, {
    candidateId: app.candidate_id,
    organizationId: session.orgId,
    actorId: session.userId,
    type: "offer_created",
    summary: `Offer created (${data.compensation.currency} ${data.compensation.base_salary} ${data.compensation.period})`,
  });

  revalidateOfferPaths();
  return { success: true, id: offer.id };
}

// ── Update Offer ──────────────────────────────────────────

export async function updateOffer(input: z.input<typeof updateOfferSchema>) {
  const session = await requireAuth();
  assertCan(session.orgRole, "offers:create");

  const parsed = updateOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input." };
  }

  const data = parsed.data;
  const supabase = await createClient();

  // Verify offer exists and is in draft status
  const { data: existing, error: fetchErr } = await supabase
    .from("offers")
    .select("id, status")
    .eq("id", data.id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !existing) {
    return { error: "Offer not found." };
  }

  if (existing.status !== "draft") {
    return { error: "Only draft offers can be edited." };
  }

  // Build update payload (only changed fields)
  const updates: Record<string, unknown> = {};
  if (data.compensation !== undefined) updates.compensation = data.compensation;
  if (data.startDate !== undefined) updates.start_date = data.startDate;
  if (data.expiryDate !== undefined) updates.expiry_date = data.expiryDate;
  if (data.terms !== undefined) updates.terms = data.terms;
  if (data.esignProvider !== undefined) updates.esign_provider = data.esignProvider;

  if (Object.keys(updates).length === 0) {
    return { error: "No changes provided." };
  }

  const { error } = await supabase
    .from("offers")
    .update(updates)
    .eq("id", data.id)
    .eq("organization_id", session.orgId);

  if (error) {
    logger.error({ error }, "Failed to update offer");
    Sentry.captureException(error);
    return { error: "Failed to update offer." };
  }

  revalidateOfferPaths();
  return { success: true };
}

// ── Submit for Approval ───────────────────────────────────

export async function submitForApproval(offerId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "offers:submit");

  const supabase = await createClient();

  // Fetch current offer
  const { data: offer, error: fetchErr } = await supabase
    .from("offers")
    .select("id, status")
    .eq("id", offerId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !offer) {
    return { error: "Offer not found." };
  }

  const ctx = await buildTransitionContext(supabase, offerId, session.orgId);
  const result = transition(offer.status as OfferStatus, "submit", ctx);

  if (!result.ok) {
    return { error: result.error };
  }

  const { error } = await supabase
    .from("offers")
    .update({ status: result.to })
    .eq("id", offerId)
    .eq("organization_id", session.orgId);

  if (error) {
    logger.error({ error }, "Failed to submit offer for approval");
    Sentry.captureException(error);
    return { error: "Failed to submit offer for approval." };
  }

  await inngest.send({
    name: "ats/offer.submitted",
    data: {
      offerId,
      organizationId: session.orgId,
      submittedBy: session.userId,
    },
  });

  revalidateOfferPaths();
  return { success: true };
}

// ── Approve Offer ─────────────────────────────────────────

export async function approveOffer(offerId: string, notes?: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "offers:approve");

  const supabase = await createClient();

  // Fetch offer
  const { data: offer, error: fetchErr } = await supabase
    .from("offers")
    .select("id, status, candidate_id")
    .eq("id", offerId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !offer) {
    return { error: "Offer not found." };
  }

  if (offer.status !== "pending_approval") {
    return { error: "Offer is not pending approval." };
  }

  // Find this user's pending approval (must be their turn — lowest pending sequence_order)
  const { data: pendingApprovals } = await supabase
    .from("offer_approvals")
    .select("id, approver_id, sequence_order, status")
    .eq("offer_id", offerId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("sequence_order", { ascending: true });

  if (!pendingApprovals || pendingApprovals.length === 0) {
    return { error: "No approvals found for this offer." };
  }

  // Find the first pending approval
  const nextPending = pendingApprovals.find((a) => a.status === "pending");
  if (!nextPending) {
    return { error: "All approvals already decided." };
  }

  // Must be this user's turn
  if (nextPending.approver_id !== session.userId) {
    return { error: "It is not your turn to approve." };
  }

  // H1-2: Atomic approval + advancement via RPC with row-level locking.
  // Prevents concurrent approvers from double-advancing the offer.
  const { error: rpcErr } = await supabase.rpc(
    "approve_offer_rpc",
    {
      p_offer_id: offerId,
      p_approval_id: nextPending.id,
      p_approver_id: session.userId,
      p_organization_id: session.orgId,
      p_notes: notes ?? null,
    },
  );

  if (rpcErr) {
    logger.error({ error: rpcErr }, "Failed to approve offer");
    Sentry.captureException(rpcErr);
    return { error: "Failed to record approval." };
  }

  // H3-1: Record approval on candidate timeline
  await recordInteraction(supabase, {
    candidateId: offer.candidate_id,
    organizationId: session.orgId,
    actorId: session.userId,
    type: "offer_approved",
    summary: `Offer approval recorded${notes ? ` — ${notes}` : ""}`,
  });

  await inngest.send({
    name: "ats/offer.approval-decided",
    data: {
      offerId,
      organizationId: session.orgId,
      decision: "approved",
      decidedBy: session.userId,
    },
  });

  revalidateOfferPaths();
  return { success: true };
}

// ── Reject Offer ──────────────────────────────────────────

export async function rejectOffer(offerId: string, notes: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "offers:approve");

  if (!notes || notes.trim().length === 0) {
    return { error: "Rejection notes are required." };
  }

  const supabase = await createClient();

  // Fetch offer
  const { data: offer, error: fetchErr } = await supabase
    .from("offers")
    .select("id, status")
    .eq("id", offerId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !offer) {
    return { error: "Offer not found." };
  }

  if (offer.status !== "pending_approval") {
    return { error: "Offer is not pending approval." };
  }

  // Find this user's pending approval
  const { data: pendingApprovals } = await supabase
    .from("offer_approvals")
    .select("id, approver_id, sequence_order, status")
    .eq("offer_id", offerId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("sequence_order", { ascending: true });

  const nextPending = pendingApprovals?.find((a) => a.status === "pending");
  if (!nextPending || nextPending.approver_id !== session.userId) {
    return { error: "It is not your turn to approve." };
  }

  // Mark this approval as rejected
  const { error: approvalErr } = await supabase
    .from("offer_approvals")
    .update({
      status: "rejected" as OfferApprovalStatus,
      decided_at: new Date().toISOString(),
      notes: notes.trim(),
    })
    .eq("id", nextPending.id)
    .eq("approver_id", session.userId);

  if (approvalErr) {
    logger.error({ error: approvalErr }, "Failed to reject offer");
    Sentry.captureException(approvalErr);
    return { error: "Failed to record rejection." };
  }

  // Per D06 §3.3: rejection resets offer to 'draft' and resets ALL approvals to 'pending'
  const { error: resetErr } = await supabase
    .from("offer_approvals")
    .update({
      status: "pending" as OfferApprovalStatus,
      decided_at: null,
      notes: null,
    })
    .eq("offer_id", offerId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null);

  if (resetErr) {
    logger.error({ error: resetErr }, "Failed to reset approvals after rejection");
    Sentry.captureException(resetErr);
  }

  // Transition offer back to draft
  await supabase
    .from("offers")
    .update({ status: "draft" as OfferStatus })
    .eq("id", offerId)
    .eq("organization_id", session.orgId);

  await inngest.send({
    name: "ats/offer.approval-decided",
    data: {
      offerId,
      organizationId: session.orgId,
      decision: "rejected",
      decidedBy: session.userId,
    },
  });

  revalidateOfferPaths();
  return { success: true };
}

// ── Send Offer for E-Sign ─────────────────────────────────

export async function sendOffer(offerId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "offers:create");

  const supabase = await createClient();

  // Fetch offer
  const { data: offer, error: fetchErr } = await supabase
    .from("offers")
    .select("id, status, esign_provider, candidate_id")
    .eq("id", offerId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !offer) {
    return { error: "Offer not found." };
  }

  const ctx = await buildTransitionContext(supabase, offerId, session.orgId);
  const result = transition(offer.status as OfferStatus, "send", ctx);

  if (!result.ok) {
    return { error: result.error };
  }

  // Dispatch to Inngest — the send-esign function handles the actual transition
  await inngest.send({
    name: "ats/offer.send-requested",
    data: {
      offerId,
      organizationId: session.orgId,
      requestedBy: session.userId,
    },
  });

  // Record on candidate timeline
  await recordInteraction(supabase, {
    candidateId: offer.candidate_id,
    organizationId: session.orgId,
    actorId: session.userId,
    type: "offer_sent",
    summary: "Offer sent for e-signature",
  });

  revalidateOfferPaths();
  return { success: true };
}

// ── Withdraw Offer ────────────────────────────────────────

export async function withdrawOffer(offerId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "offers:create");

  const supabase = await createClient();

  // Fetch offer
  const { data: offer, error: fetchErr } = await supabase
    .from("offers")
    .select("id, status, candidate_id, esign_envelope_id")
    .eq("id", offerId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !offer) {
    return { error: "Offer not found." };
  }

  const ctx = await buildTransitionContext(supabase, offerId, session.orgId);
  const result = transition(offer.status as OfferStatus, "withdraw", ctx);

  if (!result.ok) {
    return { error: result.error };
  }

  const { error } = await supabase
    .from("offers")
    .update({ status: result.to })
    .eq("id", offerId)
    .eq("organization_id", session.orgId);

  if (error) {
    logger.error({ error }, "Failed to withdraw offer");
    Sentry.captureException(error);
    return { error: "Failed to withdraw offer." };
  }

  // H3-1: Record withdrawal on candidate timeline
  await recordInteraction(supabase, {
    candidateId: offer.candidate_id,
    organizationId: session.orgId,
    actorId: session.userId,
    type: "offer_withdrawn",
    summary: "Offer withdrawn",
  });

  await inngest.send({
    name: "ats/offer.withdrawn",
    data: {
      offerId,
      organizationId: session.orgId,
      withdrawnBy: session.userId,
    },
  });

  revalidateOfferPaths();
  return { success: true };
}

// ── Mark Offer Signed (manual fallback) ───────────────────

export async function markOfferSigned(offerId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "offers:create");

  const supabase = await createClient();

  // Fetch offer
  const { data: offer, error: fetchErr } = await supabase
    .from("offers")
    .select("id, status, candidate_id")
    .eq("id", offerId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !offer) {
    return { error: "Offer not found." };
  }

  // Manual signing: must be in 'approved' or 'sent' status
  // In 'approved': no e-sign was used, manual PDF signing
  // In 'sent': e-sign was sent but recruiter manually confirms
  if (offer.status !== "approved" && offer.status !== "sent") {
    return { error: "Offer must be approved or sent to mark as signed." };
  }

  const { error } = await supabase
    .from("offers")
    .update({
      status: "signed" as OfferStatus,
      signed_at: new Date().toISOString(),
      // Clear e-sign fields for manual process (per D06 §4.2 G-010)
      ...(offer.status === "approved"
        ? { esign_provider: null, esign_envelope_id: null }
        : {}),
    })
    .eq("id", offerId)
    .eq("organization_id", session.orgId);

  if (error) {
    logger.error({ error }, "Failed to mark offer as signed");
    Sentry.captureException(error);
    return { error: "Failed to mark offer as signed." };
  }

  // H3-1: Record signing on candidate timeline
  await recordInteraction(supabase, {
    candidateId: offer.candidate_id,
    organizationId: session.orgId,
    actorId: session.userId,
    type: "offer_signed",
    summary: "Offer marked as signed",
  });

  revalidateOfferPaths();
  return { success: true };
}

// ── List Offers ───────────────────────────────────────────

export async function listOffers(filters?: {
  status?: OfferStatus;
  jobId?: string;
  candidateId?: string;
}) {
  const session = await requireAuth();
  assertCan(session.orgRole, "offers:view");

  const supabase = await createClient();

  let query = supabase
    .from("offers")
    .select("id, status, compensation, start_date, expiry_date, sent_at, signed_at, declined_at, created_at, updated_at, application_id, candidate_id, job_id, template_id, esign_provider")
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.jobId) {
    query = query.eq("job_id", filters.jobId);
  }
  if (filters?.candidateId) {
    query = query.eq("candidate_id", filters.candidateId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ error }, "Failed to list offers");
    Sentry.captureException(error);
    return { error: "Failed to load offers." };
  }

  return { success: true, data: data ?? [] };
}

// ── Get Offer Detail ──────────────────────────────────────

export async function getOffer(offerId: string) {
  const session = await requireAuth();
  assertCan(session.orgRole, "offers:view");

  const supabase = await createClient();

  const { data: offer, error } = await supabase
    .from("offers")
    .select("*")
    .eq("id", offerId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (error || !offer) {
    return { error: "Offer not found." };
  }

  // Fetch approvals separately (pre-fetch pattern per memory)
  const { data: approvals } = await supabase
    .from("offer_approvals")
    .select("id, approver_id, sequence_order, status, decided_at, notes")
    .eq("offer_id", offerId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("sequence_order", { ascending: true });

  return { success: true, data: { ...offer, approvals: approvals ?? [] } };
}
