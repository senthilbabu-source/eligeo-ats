/**
 * RLS Tests: ai_usage_logs
 * D24 §6.2 — append-only, service-role INSERT only
 *
 * Policies (migration 015):
 *   SELECT: is_org_member(organization_id) — all roles
 *   INSERT: FALSE (service role only, bypasses RLS)
 *   UPDATE: FALSE (append-only)
 *   DELETE: FALSE (append-only)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: ai_usage_logs", () => {
  let ownerClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;
  let testLogId: string;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();

    // Insert a test log via service role (the only way to insert)
    testLogId = crypto.randomUUID();
    const { error: insertErr } = await serviceClient.from("ai_usage_logs").insert({
      id: testLogId,
      organization_id: TENANT_A.org.id,
      user_id: TENANT_A.users.owner.id,
      action: "resume_parse",
      model: "test-model",
      tokens_input: 10,
      tokens_output: 5,
      credits_used: 1,
    });
    if (insertErr) throw new Error(`Setup failed: ${insertErr.message}`);
  });

  afterAll(async () => {
    // Cleanup test log
    await serviceClient.from("ai_usage_logs").delete().eq("id", testLogId);
    clearClientCache();
  });

  // ─── SELECT ─────────────────────────────────────────────

  it("Tenant A owner can SELECT own AI logs", async () => {
    const { data, error } = await ownerClient
      .from("ai_usage_logs")
      .select("id")
      .eq("id", testLogId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(testLogId);
  });

  it("Tenant A interviewer can SELECT AI logs", async () => {
    const { data, error } = await interviewerClient
      .from("ai_usage_logs")
      .select("id")
      .eq("id", testLogId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(testLogId);
  });

  it("Tenant B cannot see Tenant A AI logs", async () => {
    const { data } = await tenantBClient
      .from("ai_usage_logs")
      .select("id")
      .eq("id", testLogId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT: denied for all users (service role only) ───

  it("owner cannot INSERT AI logs", async () => {
    const { error } = await ownerClient.from("ai_usage_logs").insert({
      organization_id: TENANT_A.org.id,
      user_id: TENANT_A.users.owner.id,
      action: "resume_parse",
      model: "test",
      tokens_input: 0,
      tokens_output: 0,
      credits_used: 0,
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE: denied (append-only) ──────────────────────

  it("owner cannot UPDATE AI logs", async () => {
    const { data } = await ownerClient
      .from("ai_usage_logs")
      .update({ action: "hacked" })
      .eq("id", testLogId)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  // ─── DELETE: denied (append-only) ──────────────────────

  it("owner cannot DELETE AI logs", async () => {
    const { data } = await ownerClient
      .from("ai_usage_logs")
      .delete()
      .eq("id", testLogId)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });
});
