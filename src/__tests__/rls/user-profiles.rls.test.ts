/**
 * RLS Tests: user_profiles
 * D24 §6.2 — full 5 roles × 4 ops + cross-tenant isolation
 *
 * Policies (migration 005):
 *   SELECT: own profile OR profiles of shared org members
 *   INSERT: own profile only (id = auth.uid())
 *   UPDATE: own profile only (id = auth.uid())
 *   DELETE: FALSE (no hard deletes)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, clearClientCache } from "../helpers";

describe("RLS: user_profiles", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    adminClient = await createTestClient(TENANT_A.users.admin.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    hmClient = await createTestClient(TENANT_A.users.hiringManager.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
  });

  afterAll(() => clearClientCache());

  // ─── Tenant Isolation ───────────────────────────────────

  describe("tenant isolation", () => {
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

    it("Tenant B cannot UPDATE Tenant A profile", async () => {
      const { data } = await tenantBClient
        .from("user_profiles")
        .update({ full_name: "hacked" })
        .eq("id", TENANT_A.users.owner.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── SELECT: all 5 roles can see own + co-org profiles ──

  describe("SELECT", () => {
    it("owner can see own profile", async () => {
      const { data, error } = await ownerClient
        .from("user_profiles")
        .select("id")
        .eq("id", TENANT_A.users.owner.id)
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBe(TENANT_A.users.owner.id);
    });

    it("owner can see co-org member profile", async () => {
      const { data, error } = await ownerClient
        .from("user_profiles")
        .select("id")
        .eq("id", TENANT_A.users.recruiter.id)
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBe(TENANT_A.users.recruiter.id);
    });

    it("admin can see co-org member profile", async () => {
      const { data, error } = await adminClient
        .from("user_profiles")
        .select("id")
        .eq("id", TENANT_A.users.owner.id)
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBe(TENANT_A.users.owner.id);
    });

    it("recruiter can see co-org member profile", async () => {
      const { data, error } = await recruiterClient
        .from("user_profiles")
        .select("id")
        .eq("id", TENANT_A.users.owner.id)
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBe(TENANT_A.users.owner.id);
    });

    it("hiring_manager can see co-org member profile", async () => {
      const { data, error } = await hmClient
        .from("user_profiles")
        .select("id")
        .eq("id", TENANT_A.users.owner.id)
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBe(TENANT_A.users.owner.id);
    });

    it("interviewer can see co-org member profile", async () => {
      const { data, error } = await interviewerClient
        .from("user_profiles")
        .select("id")
        .eq("id", TENANT_A.users.owner.id)
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBe(TENANT_A.users.owner.id);
    });
  });

  // ─── INSERT: own profile only (auto-created by trigger) ─

  describe("INSERT", () => {
    it("user cannot INSERT profile for another user", async () => {
      const { error } = await ownerClient
        .from("user_profiles")
        .insert({ id: crypto.randomUUID(), full_name: "Fake User" });
      expect(error).not.toBeNull();
    });
  });

  // ─── UPDATE: own profile only ───────────────────────────

  describe("UPDATE", () => {
    it("owner can UPDATE own profile", async () => {
      const { data, error } = await ownerClient
        .from("user_profiles")
        .update({ full_name: TENANT_A.users.owner.full_name })
        .eq("id", TENANT_A.users.owner.id)
        .select("id");
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it("admin can UPDATE own profile", async () => {
      const { data, error } = await adminClient
        .from("user_profiles")
        .update({ full_name: TENANT_A.users.admin.full_name })
        .eq("id", TENANT_A.users.admin.id)
        .select("id");
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it("recruiter can UPDATE own profile", async () => {
      const { data, error } = await recruiterClient
        .from("user_profiles")
        .update({ full_name: TENANT_A.users.recruiter.full_name })
        .eq("id", TENANT_A.users.recruiter.id)
        .select("id");
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it("owner cannot UPDATE another user's profile", async () => {
      const { data } = await ownerClient
        .from("user_profiles")
        .update({ full_name: "hacked" })
        .eq("id", TENANT_A.users.recruiter.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });

    it("recruiter cannot UPDATE another user's profile", async () => {
      const { data } = await recruiterClient
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

    it("admin cannot hard-delete profile", async () => {
      const { data } = await adminClient
        .from("user_profiles")
        .delete()
        .eq("id", TENANT_A.users.admin.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });
});
