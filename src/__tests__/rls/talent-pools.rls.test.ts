/**
 * RLS Tests: talent_pools + talent_pool_members
 * D24 §6.2 — 4 ops × 2 tenants
 *
 * talent_pools (migration 012):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin only
 *
 * talent_pool_members (migration 012):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin, recruiter
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, clearClientCache } from "../helpers";

describe("RLS: talent_pools", () => {
  let ownerClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;

  // From seed: talent pool "Strong Engineers"
  const POOL_ID = "11111111-6005-4000-a000-000000000001";

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
  });

  afterAll(() => clearClientCache());

  it("Tenant A can see own talent pools", async () => {
    const { data, error } = await ownerClient
      .from("talent_pools")
      .select("id")
      .eq("id", POOL_ID)
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBe(POOL_ID);
  });

  it("Tenant B cannot see Tenant A talent pools", async () => {
    const { data } = await tenantBClient
      .from("talent_pools")
      .select("id")
      .eq("id", POOL_ID)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("interviewer can SELECT talent pools", async () => {
    const { data, error } = await interviewerClient
      .from("talent_pools")
      .select("id")
      .limit(1);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("interviewer cannot INSERT talent pools", async () => {
    const { error } = await interviewerClient
      .from("talent_pools")
      .insert({
        organization_id: TENANT_A.org.id,
        name: "Unauthorized Pool",
        created_by: TENANT_A.users.interviewer.id,
      });
    expect(error).not.toBeNull();
  });

  it("interviewer cannot UPDATE talent pools", async () => {
    const { data } = await interviewerClient
      .from("talent_pools")
      .update({ name: "hacked" })
      .eq("id", POOL_ID)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  it("interviewer cannot DELETE talent pools", async () => {
    const { data } = await interviewerClient
      .from("talent_pools")
      .delete()
      .eq("id", POOL_ID)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  it("Tenant B cannot INSERT into Tenant A pools", async () => {
    const { error } = await tenantBClient
      .from("talent_pools")
      .insert({
        organization_id: TENANT_A.org.id,
        name: "Cross-tenant hack",
        created_by: TENANT_B.users.owner.id,
      });
    expect(error).not.toBeNull();
  });
});

// ─── talent_pool_members ──────────────────────────────────

describe("RLS: talent_pool_members", () => {
  let ownerClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
  });

  afterAll(() => clearClientCache());

  it("Tenant A can see pool members", async () => {
    const { data, error } = await ownerClient
      .from("talent_pool_members")
      .select("id")
      .limit(1);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("Tenant B cannot see Tenant A pool members", async () => {
    const { data } = await tenantBClient
      .from("talent_pool_members")
      .select("id")
      .eq("organization_id", TENANT_A.org.id);
    expect(!data || data.length === 0).toBe(true);
  });

  it("interviewer cannot INSERT pool members", async () => {
    const { error } = await interviewerClient
      .from("talent_pool_members")
      .insert({
        organization_id: TENANT_A.org.id,
        talent_pool_id: "11111111-6005-4000-a000-000000000001",
        candidate_id: TENANT_A.candidates.bob.id,
        added_by: TENANT_A.users.interviewer.id,
      });
    expect(error).not.toBeNull();
  });
});
