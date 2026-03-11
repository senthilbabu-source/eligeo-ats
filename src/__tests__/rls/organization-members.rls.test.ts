/**
 * RLS Tests: organization_members
 * D24 §6.2 — 4 ops × 2 tenants + role enforcement
 *
 * Policies (migration 005):
 *   SELECT: is_org_member(organization_id) — members see co-members
 *   INSERT: user_id = auth.uid() OR has_org_role(org, 'owner', 'admin')
 *   UPDATE: has_org_role(org, 'owner', 'admin') OR user_id = auth.uid()
 *   DELETE: has_org_role(org, 'owner') only
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, clearClientCache } from "../helpers";

describe("RLS: organization_members", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    adminClient = await createTestClient(TENANT_A.users.admin.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
  });

  afterAll(() => clearClientCache());

  // ─── Tenant Isolation ───────────────────────────────────

  describe("tenant isolation", () => {
    it("Tenant A can see own org members", async () => {
      const { data, error } = await ownerClient
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", TENANT_A.org.id);
      expect(error).toBeNull();
      expect(data?.length).toBe(5); // 5 itecbrains members
    });

    it("Tenant A cannot see Tenant B members", async () => {
      const { data } = await ownerClient
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", TENANT_B.org.id);
      expect(!data || data.length === 0).toBe(true);
    });

    it("Tenant B cannot see Tenant A members", async () => {
      const { data } = await tenantBClient
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", TENANT_A.org.id);
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── SELECT: all org members ────────────────────────────

  describe("SELECT", () => {
    for (const [name, getClient] of [
      ["owner", () => ownerClient],
      ["admin", () => adminClient],
      ["recruiter", () => recruiterClient],
      ["interviewer", () => interviewerClient],
    ] as const) {
      it(`${name} can SELECT org members`, async () => {
        const { data, error } = await (getClient as () => SupabaseClient)()
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", TENANT_A.org.id);
        expect(error).toBeNull();
        expect(data!.length).toBeGreaterThan(0);
      });
    }
  });

  // ─── UPDATE: owner/admin + self ─────────────────────────

  describe("UPDATE", () => {
    it("owner can update member records", async () => {
      // Owner updates admin's record (no-op change to avoid side effects)
      const { data, error } = await ownerClient
        .from("organization_members")
        .update({ is_active: true })
        .eq("organization_id", TENANT_A.org.id)
        .eq("user_id", TENANT_A.users.admin.id)
        .select("user_id");
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it("admin can update member records", async () => {
      const { data, error } = await adminClient
        .from("organization_members")
        .update({ is_active: true })
        .eq("organization_id", TENANT_A.org.id)
        .eq("user_id", TENANT_A.users.recruiter.id)
        .select("user_id");
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it("recruiter can update own membership (last_active_org_id)", async () => {
      const { data, error } = await recruiterClient
        .from("organization_members")
        .update({ last_active_org_id: TENANT_A.org.id })
        .eq("organization_id", TENANT_A.org.id)
        .eq("user_id", TENANT_A.users.recruiter.id)
        .select("user_id");
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    });

    it("recruiter cannot update another member's record", async () => {
      const { data } = await recruiterClient
        .from("organization_members")
        .update({ is_active: false })
        .eq("organization_id", TENANT_A.org.id)
        .eq("user_id", TENANT_A.users.interviewer.id)
        .select("user_id");
      // Recruiter can only update own record — policy allows user_id = auth.uid()
      // But the WITH CHECK also requires organization_id = current_user_org_id() OR user_id = auth.uid()
      // Since user_id != auth.uid() here, it falls through to has_org_role check (recruiter not in owner/admin)
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── DELETE: owner only ─────────────────────────────────

  describe("DELETE", () => {
    it("admin cannot DELETE members", async () => {
      // Don't actually delete — just verify the policy denies
      const { data } = await adminClient
        .from("organization_members")
        .delete()
        .eq("organization_id", TENANT_A.org.id)
        .eq("user_id", TENANT_A.users.interviewer.id)
        .select("user_id");
      expect(!data || data.length === 0).toBe(true);
    });

    it("recruiter cannot DELETE members", async () => {
      const { data } = await recruiterClient
        .from("organization_members")
        .delete()
        .eq("organization_id", TENANT_A.org.id)
        .eq("user_id", TENANT_A.users.interviewer.id)
        .select("user_id");
      expect(!data || data.length === 0).toBe(true);
    });
  });
});
