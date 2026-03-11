/**
 * RLS Tests: candidate_sources + rejection_reasons
 * D24 §6.2 — 4 ops × 2 tenants
 *
 * Both tables share the same policy pattern (migration 006):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin only
 *   DELETE: owner, admin only
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

// ─── candidate_sources ────────────────────────────────────

describe("RLS: candidate_sources", () => {
  let ownerClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
  });

  afterAll(() => clearClientCache());

  it("all roles can SELECT sources", async () => {
    const { data, error } = await interviewerClient
      .from("candidate_sources")
      .select("id")
      .limit(1);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("Tenant B cannot see Tenant A sources", async () => {
    const { data } = await tenantBClient
      .from("candidate_sources")
      .select("id")
      .eq("organization_id", TENANT_A.org.id);
    expect(!data || data.length === 0).toBe(true);
  });

  it("recruiter can INSERT sources", async () => {
    const testId = crypto.randomUUID();
    const { error } = await recruiterClient
      .from("candidate_sources")
      .insert({
        id: testId,
        organization_id: TENANT_A.org.id,
        name: "RLS Test Source",
        is_system: false,
      });
    expect(error).toBeNull();
    // Cleanup
    const svc = createServiceClient();
    await svc.from("candidate_sources").delete().eq("id", testId);
  });

  it("interviewer cannot INSERT sources", async () => {
    const { error } = await interviewerClient
      .from("candidate_sources")
      .insert({
        organization_id: TENANT_A.org.id,
        name: "Unauthorized Source",
        is_system: false,
      });
    expect(error).not.toBeNull();
  });

  it("recruiter cannot UPDATE sources (owner/admin only)", async () => {
    // Get first source
    const { data: sources } = await recruiterClient
      .from("candidate_sources")
      .select("id")
      .limit(1);
    if (sources && sources.length > 0) {
      const { data } = await recruiterClient
        .from("candidate_sources")
        .update({ name: "hacked" })
        .eq("id", sources[0]!.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    }
  });

  it("interviewer cannot DELETE sources", async () => {
    const { data: sources } = await interviewerClient
      .from("candidate_sources")
      .select("id")
      .limit(1);
    if (sources && sources.length > 0) {
      const { data } = await interviewerClient
        .from("candidate_sources")
        .delete()
        .eq("id", sources[0]!.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    }
  });
});

// ─── rejection_reasons ────────────────────────────────────

describe("RLS: rejection_reasons", () => {
  let ownerClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
  });

  afterAll(() => clearClientCache());

  it("all roles can SELECT rejection reasons", async () => {
    const { data, error } = await interviewerClient
      .from("rejection_reasons")
      .select("id")
      .limit(1);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("Tenant B cannot see Tenant A rejection reasons", async () => {
    const { data } = await tenantBClient
      .from("rejection_reasons")
      .select("id")
      .eq("organization_id", TENANT_A.org.id);
    expect(!data || data.length === 0).toBe(true);
  });

  it("interviewer cannot INSERT rejection reasons", async () => {
    const { error } = await interviewerClient
      .from("rejection_reasons")
      .insert({
        organization_id: TENANT_A.org.id,
        name: "Unauthorized Reason",
        is_system: false,
      });
    expect(error).not.toBeNull();
  });

  it("Tenant B cannot INSERT into Tenant A reasons", async () => {
    const { error } = await tenantBClient
      .from("rejection_reasons")
      .insert({
        organization_id: TENANT_A.org.id,
        name: "Cross-tenant hack",
        is_system: false,
      });
    expect(error).not.toBeNull();
  });
});
