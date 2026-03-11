/**
 * RLS Tests: user_profiles
 * D24 §6.2 — 4 ops × 2 tenants + role enforcement
 *
 * Policies (migration 005):
 *   SELECT: own profile OR profiles of shared org members
 *   INSERT: own profile only (id = auth.uid())
 *   UPDATE: own profile only
 *   DELETE: FALSE (no hard deletes)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, clearClientCache } from "../helpers";

describe("RLS: user_profiles", () => {
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

  // ─── Tenant Isolation ───────────────────────────────────

  describe("tenant isolation", () => {
    it("Tenant A can see own profile", async () => {
      const { data, error } = await ownerClient
        .from("user_profiles")
        .select("id")
        .eq("id", TENANT_A.users.owner.id)
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBe(TENANT_A.users.owner.id);
    });

    it("Tenant A can see co-org member profiles", async () => {
      const { data, error } = await ownerClient
        .from("user_profiles")
        .select("id")
        .eq("id", TENANT_A.users.recruiter.id)
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBe(TENANT_A.users.recruiter.id);
    });

    it("Tenant A cannot see Tenant B profiles", async () => {
      const { data } = await ownerClient
        .from("user_profiles")
        .select("id")
        .eq("id", TENANT_B.users.owner.id)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("Tenant B cannot see Tenant A profiles", async () => {
      const { data } = await tenantBClient
        .from("user_profiles")
        .select("id")
        .eq("id", TENANT_A.users.owner.id)
        .maybeSingle();
      expect(data).toBeNull();
    });
  });

  // ─── UPDATE: own profile only ───────────────────────────

  describe("UPDATE", () => {
    it("user can update own profile", async () => {
      const { data, error } = await ownerClient
        .from("user_profiles")
        .update({ full_name: TENANT_A.users.owner.full_name })
        .eq("id", TENANT_A.users.owner.id)
        .select("id");
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it("user cannot update another user's profile", async () => {
      const { data } = await recruiterClient
        .from("user_profiles")
        .update({ full_name: "hacked" })
        .eq("id", TENANT_A.users.owner.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });

    it("Tenant B cannot update Tenant A profile", async () => {
      const { data } = await tenantBClient
        .from("user_profiles")
        .update({ full_name: "hacked" })
        .eq("id", TENANT_A.users.owner.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── DELETE: always denied ──────────────────────────────

  describe("DELETE", () => {
    it("owner cannot hard-delete own profile", async () => {
      const { data } = await ownerClient
        .from("user_profiles")
        .delete()
        .eq("id", TENANT_A.users.owner.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });
});
