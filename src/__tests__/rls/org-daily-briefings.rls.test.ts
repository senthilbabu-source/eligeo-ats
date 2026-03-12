/**
 * RLS Tests: org_daily_briefings
 * D24 §6.2 — daily AI briefing cache per org
 *
 * Policies (migration 021):
 *   SELECT: is_org_member(organization_id) — all roles, own org only
 *   INSERT: owner/admin only (has_org_role + current_user_org_id)
 *   UPDATE: owner/admin only
 *   DELETE: owner/admin only
 *
 * Cross-tenant: Tenant B cannot see Tenant A briefings.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

describe("RLS: org_daily_briefings", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;
  let testBriefingId: string;
  let tenantBBriefingId: string;

  const sampleContent = { win: "3 hires this month", blocker: "Phone screen backlog", action: "Schedule 5 interviews" };

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    adminClient = await createTestClient(TENANT_A.users.admin.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    hmClient = await createTestClient(TENANT_A.users.hiringManager.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();

    // Clean up any leftover briefings for today (from prior test runs)
    await serviceClient.from("org_daily_briefings").delete()
      .eq("organization_id", TENANT_A.org.id).eq("briefing_date", TODAY);
    await serviceClient.from("org_daily_briefings").delete()
      .eq("organization_id", TENANT_B.org.id).eq("briefing_date", TODAY);

    // Insert TENANT_A briefing via service role
    testBriefingId = crypto.randomUUID();
    const { error: insErr } = await serviceClient.from("org_daily_briefings").insert({
      id: testBriefingId,
      organization_id: TENANT_A.org.id,
      briefing_date: TODAY,
      content: sampleContent,
      model: "gpt-4o-mini",
      prompt_tokens: 100,
      completion_tokens: 80,
    });
    if (insErr) throw new Error(`TENANT_A briefing setup failed: ${insErr.message}`);

    // Insert TENANT_B briefing via service role (for cross-tenant isolation test)
    tenantBBriefingId = crypto.randomUUID();
    const { error: insBErr } = await serviceClient.from("org_daily_briefings").insert({
      id: tenantBBriefingId,
      organization_id: TENANT_B.org.id,
      briefing_date: TODAY,
      content: { win: "B win", blocker: "B blocker", action: "B action" },
      model: "gpt-4o-mini",
      prompt_tokens: 50,
      completion_tokens: 40,
    });
    if (insBErr) throw new Error(`TENANT_B briefing setup failed: ${insBErr.message}`);
  });

  afterAll(async () => {
    await serviceClient.from("org_daily_briefings").delete().in("id", [testBriefingId, tenantBBriefingId]);
    clearClientCache();
  });

  // ─── SELECT ─────────────────────────────────────────────

  it("owner can SELECT own org briefing", async () => {
    const { data, error } = await ownerClient
      .from("org_daily_briefings")
      .select("id")
      .eq("id", testBriefingId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(testBriefingId);
  });

  it("admin can SELECT own org briefing", async () => {
    const { data, error } = await adminClient
      .from("org_daily_briefings")
      .select("id")
      .eq("id", testBriefingId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(testBriefingId);
  });

  it("recruiter can SELECT own org briefing", async () => {
    const { data, error } = await recruiterClient
      .from("org_daily_briefings")
      .select("id")
      .eq("id", testBriefingId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(testBriefingId);
  });

  it("hiring_manager can SELECT own org briefing", async () => {
    const { data, error } = await hmClient
      .from("org_daily_briefings")
      .select("id")
      .eq("id", testBriefingId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(testBriefingId);
  });

  it("interviewer can SELECT own org briefing", async () => {
    const { data, error } = await interviewerClient
      .from("org_daily_briefings")
      .select("id")
      .eq("id", testBriefingId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(testBriefingId);
  });

  it("Tenant B cannot SELECT Tenant A briefing", async () => {
    const { data } = await tenantBClient
      .from("org_daily_briefings")
      .select("id")
      .eq("id", testBriefingId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("Tenant A cannot SELECT Tenant B briefing", async () => {
    const { data } = await ownerClient
      .from("org_daily_briefings")
      .select("id")
      .eq("id", tenantBBriefingId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ─────────────────────────────────────────────

  it("owner can INSERT a briefing for own org", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await ownerClient.from("org_daily_briefings").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      briefing_date: "2000-01-01", // past date to avoid UNIQUE conflict
      content: sampleContent,
      model: "gpt-4o-mini",
    });
    // cleanup regardless
    await serviceClient.from("org_daily_briefings").delete().eq("id", tempId);
    expect(error).toBeNull();
  });

  it("admin can INSERT a briefing for own org", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await adminClient.from("org_daily_briefings").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      briefing_date: "2000-01-02",
      content: sampleContent,
      model: "gpt-4o-mini",
    });
    await serviceClient.from("org_daily_briefings").delete().eq("id", tempId);
    expect(error).toBeNull();
  });

  it("recruiter cannot INSERT a briefing", async () => {
    const { error } = await recruiterClient.from("org_daily_briefings").insert({
      organization_id: TENANT_A.org.id,
      briefing_date: "2000-01-03",
      content: sampleContent,
      model: "gpt-4o-mini",
    });
    expect(error).not.toBeNull();
  });

  it("hiring_manager cannot INSERT a briefing", async () => {
    const { error } = await hmClient.from("org_daily_briefings").insert({
      organization_id: TENANT_A.org.id,
      briefing_date: "2000-01-04",
      content: sampleContent,
      model: "gpt-4o-mini",
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B owner cannot INSERT briefing for Tenant A", async () => {
    const { error } = await tenantBClient.from("org_daily_briefings").insert({
      organization_id: TENANT_A.org.id, // cross-tenant attempt
      briefing_date: "2000-01-05",
      content: sampleContent,
      model: "gpt-4o-mini",
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ─────────────────────────────────────────────

  it("owner can UPDATE own org briefing", async () => {
    const { error } = await ownerClient
      .from("org_daily_briefings")
      .update({ model: "gpt-4o" })
      .eq("id", testBriefingId);
    expect(error).toBeNull();
    // restore
    await serviceClient.from("org_daily_briefings").update({ model: "gpt-4o-mini" }).eq("id", testBriefingId);
  });

  it("recruiter cannot UPDATE briefings", async () => {
    const { data } = await recruiterClient
      .from("org_daily_briefings")
      .update({ model: "hacked" })
      .eq("id", testBriefingId)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  it("Tenant B cannot UPDATE Tenant A briefing", async () => {
    const { data } = await tenantBClient
      .from("org_daily_briefings")
      .update({ model: "hacked" })
      .eq("id", testBriefingId)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  // ─── DELETE ─────────────────────────────────────────────

  it("recruiter cannot DELETE briefings", async () => {
    const { data } = await recruiterClient
      .from("org_daily_briefings")
      .delete()
      .eq("id", testBriefingId)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  it("Tenant B cannot DELETE Tenant A briefing", async () => {
    const { data } = await tenantBClient
      .from("org_daily_briefings")
      .delete()
      .eq("id", testBriefingId)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });
});
