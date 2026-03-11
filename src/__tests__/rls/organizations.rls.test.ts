/**
 * RLS Tests: organizations
 * D24 §6.2 — full 5 roles × 4 ops + cross-tenant isolation
 *
 * Policies (migration 005):
 *   SELECT: is_org_member(id) — members see their org
 *   INSERT: TRUE (anyone, for signup flow)
 *   UPDATE: has_org_role(id, 'owner', 'admin') + WITH CHECK org_id match
 *   DELETE: FALSE (no hard deletes, ADR-006)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import {
  createTestClient,
  createServiceClient,
  clearClientCache,
} from "../helpers";

describe("RLS: organizations", () => {
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
    it("Tenant A owner can see own org", async () => {
      const { data, error } = await ownerClient
        .from("organizations")
        .select("id")
        .eq("id", TENANT_A.org.id)
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBe(TENANT_A.org.id);
    });

    it("Tenant A cannot see Tenant B org", async () => {
      const { data } = await ownerClient
        .from("organizations")
        .select("id")
        .eq("id", TENANT_B.org.id)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("Tenant B cannot see Tenant A org", async () => {
      const { data } = await tenantBClient
        .from("organizations")
        .select("id")
        .eq("id", TENANT_A.org.id)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("Tenant B cannot UPDATE Tenant A org", async () => {
      const { data } = await tenantBClient
        .from("organizations")
        .update({ name: "hacked" })
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(data).toEqual([]);
    });

    it("Tenant B cannot DELETE Tenant A org", async () => {
      const { data } = await tenantBClient
        .from("organizations")
        .delete()
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── SELECT: all 5 roles can see own org ────────────────

  describe("SELECT", () => {
    const roleClients = () => [
      ["owner", ownerClient],
      ["admin", adminClient],
      ["recruiter", recruiterClient],
      ["hiring_manager", hmClient],
      ["interviewer", interviewerClient],
    ] as const;

    for (const [name] of [["owner"], ["admin"], ["recruiter"], ["hiring_manager"], ["interviewer"]] as const) {
      it(`${name} can SELECT own org`, async () => {
        const clients = { owner: ownerClient, admin: adminClient, recruiter: recruiterClient, hiring_manager: hmClient, interviewer: interviewerClient };
        const { data, error } = await clients[name]
          .from("organizations")
          .select("id")
          .eq("id", TENANT_A.org.id)
          .single();
        expect(error).toBeNull();
        expect(data?.id).toBe(TENANT_A.org.id);
      });
    }
  });

  // ─── INSERT: policy is TRUE (signup flow) ───────────────

  describe("INSERT", () => {
    it("authenticated user can INSERT org (signup flow)", async () => {
      const testId = crypto.randomUUID();
      const { error } = await ownerClient
        .from("organizations")
        .insert({
          id: testId,
          name: "RLS Test Org",
          slug: `rls-test-${Date.now()}`,
          plan: "starter",
        });
      expect(error).toBeNull();
      // Cleanup
      const svc = createServiceClient();
      await svc.from("organizations").delete().eq("id", testId);
    });
  });

  // ─── UPDATE: owner and admin only ───────────────────────

  describe("UPDATE", () => {
    it("owner can UPDATE own org", async () => {
      const { data, error } = await ownerClient
        .from("organizations")
        .update({ name: TENANT_A.org.name })
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it("admin can UPDATE own org", async () => {
      const { data, error } = await adminClient
        .from("organizations")
        .update({ name: TENANT_A.org.name })
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it("recruiter cannot UPDATE org", async () => {
      const { data } = await recruiterClient
        .from("organizations")
        .update({ name: "unauthorized" })
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });

    it("hiring_manager cannot UPDATE org", async () => {
      const { data } = await hmClient
        .from("organizations")
        .update({ name: "unauthorized" })
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });

    it("interviewer cannot UPDATE org", async () => {
      const { data } = await interviewerClient
        .from("organizations")
        .update({ name: "unauthorized" })
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── DELETE: always denied (ADR-006) ────────────────────

  describe("DELETE", () => {
    it("owner cannot hard-delete org (policy: FALSE)", async () => {
      const { data } = await ownerClient
        .from("organizations")
        .delete()
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });

    it("admin cannot hard-delete org", async () => {
      const { data } = await adminClient
        .from("organizations")
        .delete()
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });

    it("recruiter cannot hard-delete org", async () => {
      const { data } = await recruiterClient
        .from("organizations")
        .delete()
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });

    it("hiring_manager cannot hard-delete org", async () => {
      const { data } = await hmClient
        .from("organizations")
        .delete()
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });

    it("interviewer cannot hard-delete org", async () => {
      const { data } = await interviewerClient
        .from("organizations")
        .delete()
        .eq("id", TENANT_A.org.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });
});
