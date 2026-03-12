/**
 * RLS Tests: offer_approvals
 * D24 §6.2 — Phase 4 (Offers)
 *
 * Policies (from schema/06-offers.md):
 *   SELECT: is_org_member AND deleted_at IS NULL AND (has_org_role(owner, admin, recruiter) OR approver_id = auth.uid())
 *   INSERT: organization_id = current_user_org_id() AND has_org_role(owner, admin, recruiter)
 *   UPDATE: deleted_at IS NULL AND (approver_id = auth.uid() OR has_org_role(owner, admin)) AND organization_id = current_user_org_id()
 *   DELETE: FALSE (soft-delete only)
 *
 * Special: hiring_manager can SELECT and UPDATE their own approval (approver_id = auth.uid())
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's approvals.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import {
  createTestClient,
  createServiceClient,
  clearClientCache,
} from "../helpers";

describe("RLS: offer_approvals", () => {
  let ownerClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  const approvalId = TENANT_A.offerApprovals.aliceApprovalHM.id;
  const offerId = TENANT_A.offers.aliceDraft.id;
  const cleanupIds: string[] = [];

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    hmClient = await createTestClient(TENANT_A.users.hiringManager.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();
  });

  afterAll(async () => {
    for (const id of cleanupIds) {
      await serviceClient.from("offer_approvals").delete().eq("id", id);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT all approvals in own org", async () => {
    const { data, error } = await ownerClient
      .from("offer_approvals")
      .select("id")
      .eq("id", approvalId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(approvalId);
  });

  it("recruiter can SELECT all approvals in own org", async () => {
    const { data, error } = await recruiterClient
      .from("offer_approvals")
      .select("id")
      .eq("id", approvalId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(approvalId);
  });

  it("hiring_manager can SELECT their own approval (approver_id = uid)", async () => {
    const { data, error } = await hmClient
      .from("offer_approvals")
      .select("id")
      .eq("id", approvalId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(approvalId);
  });

  it("interviewer CANNOT SELECT approvals (excluded by role + not approver)", async () => {
    const { data } = await interviewerClient
      .from("offer_approvals")
      .select("id")
      .eq("id", approvalId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("Tenant B CANNOT SELECT Tenant A approvals", async () => {
    const { data } = await tenantBClient
      .from("offer_approvals")
      .select("id")
      .eq("id", approvalId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("recruiter can INSERT approvals in own org", async () => {
    const id = crypto.randomUUID();
    cleanupIds.push(id);
    const { error } = await recruiterClient.from("offer_approvals").insert({
      id,
      organization_id: TENANT_A.org.id,
      offer_id: offerId,
      approver_id: TENANT_A.users.admin.id,
      sequence_order: 2,
    });
    expect(error).toBeNull();
  });

  it("hiring_manager CANNOT INSERT approvals", async () => {
    const { error } = await hmClient.from("offer_approvals").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      offer_id: offerId,
      approver_id: TENANT_A.users.owner.id,
      sequence_order: 3,
    });
    expect(error).not.toBeNull();
  });

  it("interviewer CANNOT INSERT approvals", async () => {
    const { error } = await interviewerClient.from("offer_approvals").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      offer_id: offerId,
      approver_id: TENANT_A.users.owner.id,
      sequence_order: 3,
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B CANNOT INSERT approvals into Tenant A org", async () => {
    const { error } = await tenantBClient.from("offer_approvals").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      offer_id: offerId,
      approver_id: TENANT_B.users.owner.id,
      sequence_order: 3,
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("hiring_manager can UPDATE their own approval (decide)", async () => {
    const { data } = await hmClient
      .from("offer_approvals")
      .update({ notes: "Reviewed and pending decision" })
      .eq("id", approvalId)
      .select("id");
    expect(data).toHaveLength(1);
  });

  it("owner can UPDATE any approval in own org (admin override)", async () => {
    const { data } = await ownerClient
      .from("offer_approvals")
      .update({ notes: "Owner override note" })
      .eq("id", approvalId)
      .select("id");
    expect(data).toHaveLength(1);
  });

  it("interviewer CANNOT UPDATE approvals", async () => {
    const { data } = await interviewerClient
      .from("offer_approvals")
      .update({ notes: "Should not update" })
      .eq("id", approvalId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  it("Tenant B CANNOT UPDATE Tenant A approvals", async () => {
    const { data } = await tenantBClient
      .from("offer_approvals")
      .update({ notes: "Cross-tenant attack" })
      .eq("id", approvalId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("owner CANNOT hard-delete approvals (policy = FALSE)", async () => {
    const { data } = await ownerClient
      .from("offer_approvals")
      .delete()
      .eq("id", approvalId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  it("Tenant B CANNOT hard-delete Tenant A approvals", async () => {
    const { data } = await tenantBClient
      .from("offer_approvals")
      .delete()
      .eq("id", approvalId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  // ─── Restore modified approval ────────────────────────────

  afterAll(async () => {
    await serviceClient
      .from("offer_approvals")
      .update({ notes: null })
      .eq("id", approvalId);
  });
});
