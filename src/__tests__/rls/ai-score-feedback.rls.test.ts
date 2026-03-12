/**
 * RLS Tests: ai_score_feedback
 * D24 §6.2 — recruiter thumbs-up/down on AI match scores
 *
 * Policies (migration 022):
 *   SELECT: is_org_member(organization_id) — all roles, own org only
 *   INSERT: is_org_member + org scope + given_by = auth.uid() (self-insert only)
 *   UPDATE: DENIED (no policy — signals are immutable)
 *   DELETE: submitter OR owner/admin (given_by = auth.uid() OR has_org_role owner/admin)
 *
 * Cross-tenant: Tenant B cannot see or insert into Tenant A's feedback.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: ai_score_feedback", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  // Seed row inserted via service role — owned by the recruiter (TENANT_A)
  let seedFeedbackId: string;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    adminClient = await createTestClient(TENANT_A.users.admin.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    hmClient = await createTestClient(TENANT_A.users.hiringManager.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();

    // Insert TENANT_A feedback row — given_by the recruiter
    seedFeedbackId = crypto.randomUUID();
    const { error: seedErr } = await serviceClient.from("ai_score_feedback").insert({
      id: seedFeedbackId,
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      signal: "thumbs_up",
      given_by: TENANT_A.users.recruiter.id,
      match_score_at_time: 87.5,
    });
    if (seedErr) throw new Error(`TENANT_A feedback seed failed: ${seedErr.message}`);

    // Cross-tenant isolation is tested by TENANT_B trying to query/mutate TENANT_A's row.
    // No TENANT_B seed row needed (no TENANT_B application fixture exists).
  });

  afterAll(async () => {
    if (seedFeedbackId) {
      await serviceClient.from("ai_score_feedback").delete().eq("id", seedFeedbackId);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT feedback in own org", async () => {
    const { data, error } = await ownerClient
      .from("ai_score_feedback")
      .select("id")
      .eq("id", seedFeedbackId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedFeedbackId);
  });

  it("admin can SELECT feedback in own org", async () => {
    const { data, error } = await adminClient
      .from("ai_score_feedback")
      .select("id")
      .eq("id", seedFeedbackId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedFeedbackId);
  });

  it("recruiter can SELECT feedback in own org", async () => {
    const { data, error } = await recruiterClient
      .from("ai_score_feedback")
      .select("id")
      .eq("id", seedFeedbackId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedFeedbackId);
  });

  it("hiring_manager can SELECT feedback in own org", async () => {
    const { data, error } = await hmClient
      .from("ai_score_feedback")
      .select("id")
      .eq("id", seedFeedbackId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedFeedbackId);
  });

  it("interviewer can SELECT feedback in own org", async () => {
    const { data, error } = await interviewerClient
      .from("ai_score_feedback")
      .select("id")
      .eq("id", seedFeedbackId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedFeedbackId);
  });

  it("Tenant B cannot SELECT Tenant A feedback", async () => {
    const { data } = await tenantBClient
      .from("ai_score_feedback")
      .select("id")
      .eq("id", seedFeedbackId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("recruiter can INSERT their own signal", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await recruiterClient.from("ai_score_feedback").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      signal: "thumbs_down",
      given_by: TENANT_A.users.recruiter.id,
    });
    await serviceClient.from("ai_score_feedback").delete().eq("id", tempId);
    expect(error).toBeNull();
  });

  it("owner can INSERT their own signal", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await ownerClient.from("ai_score_feedback").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      signal: "thumbs_up",
      given_by: TENANT_A.users.owner.id,
    });
    await serviceClient.from("ai_score_feedback").delete().eq("id", tempId);
    expect(error).toBeNull();
  });

  it("recruiter cannot INSERT signal on behalf of another user", async () => {
    // given_by = owner ID but authenticated as recruiter — should be denied
    const { error } = await recruiterClient.from("ai_score_feedback").insert({
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      signal: "thumbs_up",
      given_by: TENANT_A.users.owner.id, // not the authenticated user
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B cannot INSERT feedback for Tenant A", async () => {
    const { error } = await tenantBClient.from("ai_score_feedback").insert({
      organization_id: TENANT_A.org.id, // cross-tenant attempt
      application_id: TENANT_A.applications.aliceForEngineer.id,
      signal: "thumbs_up",
      given_by: TENANT_B.users.owner.id,
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────
  // No UPDATE policy exists — all updates should be silently rejected.

  it("owner cannot UPDATE any feedback (signals are immutable)", async () => {
    const { data } = await ownerClient
      .from("ai_score_feedback")
      .update({ signal: "thumbs_down" })
      .eq("id", seedFeedbackId)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  it("recruiter cannot UPDATE their own feedback", async () => {
    const { data } = await recruiterClient
      .from("ai_score_feedback")
      .update({ signal: "thumbs_down" })
      .eq("id", seedFeedbackId)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  it("Tenant B cannot UPDATE Tenant A feedback", async () => {
    const { data } = await tenantBClient
      .from("ai_score_feedback")
      .update({ signal: "thumbs_down" })
      .eq("id", seedFeedbackId)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  // ─── DELETE ────────────────────────────────────────────────
  // Submitter or owner/admin can hard-delete; prefer soft-delete via service role.

  it("interviewer (non-submitter) cannot DELETE feedback from another user", async () => {
    // seedFeedbackId was created by the recruiter; interviewer should be denied
    const { data } = await interviewerClient
      .from("ai_score_feedback")
      .delete()
      .eq("id", seedFeedbackId)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  it("Tenant B cannot DELETE Tenant A feedback", async () => {
    const { data } = await tenantBClient
      .from("ai_score_feedback")
      .delete()
      .eq("id", seedFeedbackId)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  it("admin can DELETE feedback in own org", async () => {
    // Create a temp row then delete it as admin
    const tempId = crypto.randomUUID();
    await serviceClient.from("ai_score_feedback").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      signal: "thumbs_up",
      given_by: TENANT_A.users.recruiter.id,
    });
    const { data, error } = await adminClient
      .from("ai_score_feedback")
      .delete()
      .eq("id", tempId)
      .select("id");
    // If row was already gone (delete succeeded) or data has it — either way check no error
    // Supabase returns deleted rows in data if .select() is chained
    const deleted = data && data.length > 0;
    if (!deleted) {
      // cleanup in case delete silently failed
      await serviceClient.from("ai_score_feedback").delete().eq("id", tempId);
    }
    expect(error).toBeNull();
    expect(deleted).toBe(true);
  });

  it("recruiter can DELETE their own feedback signal", async () => {
    const tempId = crypto.randomUUID();
    await serviceClient.from("ai_score_feedback").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      signal: "thumbs_down",
      given_by: TENANT_A.users.recruiter.id,
    });
    const { data, error } = await recruiterClient
      .from("ai_score_feedback")
      .delete()
      .eq("id", tempId)
      .select("id");
    const deleted = data && data.length > 0;
    if (!deleted) {
      await serviceClient.from("ai_score_feedback").delete().eq("id", tempId);
    }
    expect(error).toBeNull();
    expect(deleted).toBe(true);
  });
});
