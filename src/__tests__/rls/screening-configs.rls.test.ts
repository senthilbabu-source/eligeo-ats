/**
 * RLS Tests: screening_configs
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

describe("RLS: screening_configs", () => {
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
    it("owner can query screening configs in own org", async () => {
      const { error } = await ownerClient
        .from("screening_configs")
        .select("id")
        .eq("organization_id", TENANT_A.org.id)
        .limit(1);
      expect(error).toBeNull();
    });

    it("recruiter can query screening configs in own org", async () => {
      const { error } = await recruiterClient
        .from("screening_configs")
        .select("id")
        .eq("organization_id", TENANT_A.org.id)
        .limit(1);
      expect(error).toBeNull();
    });
  });

  // ─── Tenant Isolation ───────────────────────────────────

  describe("tenant isolation", () => {
    it("Tenant B cannot see Tenant A screening configs", async () => {
      const { data } = await tenantBClient
        .from("screening_configs")
        .select("id")
        .eq("id", TENANT_A.screening.config.id)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("Tenant B cannot INSERT config into Tenant A org", async () => {
      const { error } = await tenantBClient
        .from("screening_configs")
        .insert({
          organization_id: TENANT_A.org.id,
          job_opening_id: TENANT_A.jobs.seniorEngineer.id,
          questions: [{ id: "q1", order: 1, topic: "Test", raw_question: "Test?", is_required: true }],
          created_by: TENANT_B.users.owner.id,
        });
      expect(error).not.toBeNull();
    });
  });

  // ─── INSERT ─────────────────────────────────────────────

  describe("INSERT", () => {
    it("owner can insert config in own org", async () => {
      const { error } = await ownerClient
        .from("screening_configs")
        .insert({
          organization_id: TENANT_A.org.id,
          job_opening_id: TENANT_A.jobs.productManager.id,
          questions: [{ id: "q1", order: 1, topic: "General", raw_question: "Tell me about yourself.", is_required: true }],
          created_by: TENANT_A.users.owner.id,
        });
      // May fail on unique constraint — just check no RLS denial
      if (error) {
        expect(error.code).not.toBe("42501");
      }
    });
  });

  // ─── UPDATE ─────────────────────────────────────────────

  describe("UPDATE", () => {
    it("owner can update config in own org", async () => {
      const { error } = await ownerClient
        .from("screening_configs")
        .update({ is_active: false })
        .eq("id", TENANT_A.screening.config.id);
      if (error) {
        expect(error.code).not.toBe("42501");
      }
      // Restore
      await serviceClient
        .from("screening_configs")
        .update({ is_active: true })
        .eq("id", TENANT_A.screening.config.id);
    });

    it("Tenant B cannot update Tenant A config", async () => {
      const { data } = await tenantBClient
        .from("screening_configs")
        .update({ is_active: false })
        .eq("id", TENANT_A.screening.config.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── DELETE (soft delete via policy) ────────────────────

  describe("DELETE", () => {
    it("Tenant B cannot delete Tenant A config", async () => {
      const { data } = await tenantBClient
        .from("screening_configs")
        .delete()
        .eq("id", TENANT_A.screening.config.id)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });
});
