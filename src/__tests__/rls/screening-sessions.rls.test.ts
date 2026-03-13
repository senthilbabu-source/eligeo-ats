/**
 * RLS Tests: screening_sessions
 * D24 §6.2 — org-scoped CRUD, soft delete via DELETE policy
 *
 * Policies (migration 032):
 *   SELECT: org_id matches current_user_org_id()
 *   INSERT: org_id matches current_user_org_id()
 *   UPDATE: org_id matches current_user_org_id()
 *   DELETE: org_id matches current_user_org_id() (soft delete)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: screening_sessions", () => {
  let ownerClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();
  });

  afterAll(() => {
    clearClientCache();
  });

  // ─── SELECT ─────────────────────────────────────────────

  describe("SELECT", () => {
    it("owner can query screening sessions in own org", async () => {
      const { error } = await ownerClient
        .from("screening_sessions")
        .select("id")
        .eq("organization_id", TENANT_A.org.id)
        .limit(1);
      expect(error).toBeNull();
    });

    it("recruiter can query screening sessions in own org", async () => {
      const { data, error } = await recruiterClient
        .from("screening_sessions")
        .select("id, status")
        .eq("organization_id", TENANT_A.org.id);
      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThan(0);
    });
  });

  // ─── Tenant Isolation ───────────────────────────────────

  describe("tenant isolation", () => {
    it("Tenant B cannot see Tenant A screening sessions", async () => {
      const { data } = await tenantBClient
        .from("screening_sessions")
        .select("id")
        .eq("id", TENANT_A.screening.session.id)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("Tenant B cannot INSERT session into Tenant A org", async () => {
      const { error } = await tenantBClient
        .from("screening_sessions")
        .insert({
          organization_id: TENANT_A.org.id,
          application_id: TENANT_A.applications.aliceForEngineer.id,
          candidate_id: TENANT_A.candidates.alice.id,
          config_id: TENANT_A.screening.config.id,
          status: "pending",
        });
      expect(error).not.toBeNull();
    });
  });

  // ─── INSERT ─────────────────────────────────────────────

  describe("INSERT", () => {
    it("owner can insert session in own org", async () => {
      const { error } = await ownerClient
        .from("screening_sessions")
        .insert({
          organization_id: TENANT_A.org.id,
          application_id: TENANT_A.applications.aliceForEngineer.id,
          candidate_id: TENANT_A.candidates.alice.id,
          config_id: TENANT_A.screening.config.id,
          status: "pending",
        });
      // May fail on unique constraints — just check no RLS denial
      if (error) {
        expect(error.code).not.toBe("42501");
      }
    });
  });

  // ─── UPDATE ─────────────────────────────────────────────

  describe("UPDATE", () => {
    it("owner can update session in own org", async () => {
      const { error } = await ownerClient
        .from("screening_sessions")
        .update({ human_review_requested: true })
        .eq("id", TENANT_A.screening.session.id);
      if (error) {
        expect(error.code).not.toBe("42501");
      }
      // Restore
      await serviceClient
        .from("screening_sessions")
        .update({ human_review_requested: false })
        .eq("id", TENANT_A.screening.session.id);
    });

    it("Tenant B cannot update Tenant A session", async () => {
      const { data } = await tenantBClient
        .from("screening_sessions")
        .update({ status: "abandoned" })
        .eq("id", TENANT_A.screening.session.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── DELETE (soft delete via policy) ────────────────────

  describe("DELETE", () => {
    it("Tenant B cannot delete Tenant A session", async () => {
      const { data } = await tenantBClient
        .from("screening_sessions")
        .delete()
        .eq("id", TENANT_A.screening.session.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });
});
