/**
 * RLS Tests: organizations
 * D24 §6.2 — 4 ops × 2 tenants + role enforcement
 *
 * Policies (migration 005):
 *   SELECT: is_org_member(id) — members see their org
 *   INSERT: TRUE (anyone, for signup flow)
 *   UPDATE: has_org_role(id, 'owner', 'admin') + WITH CHECK org_id match
 *   DELETE: FALSE (no hard deletes)
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
  });

  // ─── SELECT: all roles can see own org ──────────────────

  describe("SELECT", () => {
    for (const [name, client] of [
      ["owner", () => ownerClient],
      ["admin", () => adminClient],
      ["recruiter", () => recruiterClient],
      ["hiring_manager", () => hmClient],
      ["interviewer", () => interviewerClient],
    ] as const) {
      it(`${name} can SELECT own org`, async () => {
        const { data, error } = await (client as () => SupabaseClient)()
          .from("organizations")
          .select("id")
          .eq("id", TENANT_A.org.id)
          .single();
        expect(error).toBeNull();
        expect(data?.id).toBe(TENANT_A.org.id);
      });
    }
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

    for (const [name, client] of [
      ["recruiter", () => recruiterClient],
      ["hiring_manager", () => hmClient],
      ["interviewer", () => interviewerClient],
    ] as const) {
      it(`${name} cannot UPDATE org`, async () => {
        const { data } = await (client as () => SupabaseClient)()
          .from("organizations")
          .update({ name: "unauthorized" })
          .eq("id", TENANT_A.org.id)
          .select("id");
        expect(!data || data.length === 0).toBe(true);
      });
    }
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
  });
});
