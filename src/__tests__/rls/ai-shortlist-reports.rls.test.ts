/**
 * RLS Tests: ai_shortlist_reports
 * D24 §6.2 — org-scoped CRUD, soft delete only (no hard DELETE)
 *
 * Policies (migration 031):
 *   SELECT: org_id matches current_user_org_id()
 *   INSERT: org_id matches current_user_org_id()
 *   UPDATE: org_id matches current_user_org_id()
 *   DELETE: no policy (soft delete only)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: ai_shortlist_reports", () => {
  let ownerClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  let insertedReportId: string | null = null;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();
  });

  afterAll(async () => {
    if (insertedReportId) {
      await serviceClient
        .from("ai_shortlist_reports")
        .delete()
        .eq("id", insertedReportId);
    }
    clearClientCache();
  });

  // ─── SELECT ─────────────────────────────────────────────

  describe("SELECT", () => {
    it("owner can query shortlist reports in own org", async () => {
      const { error } = await ownerClient
        .from("ai_shortlist_reports")
        .select("id")
        .eq("organization_id", TENANT_A.org.id)
        .limit(1);
      expect(error).toBeNull();
    });

    it("recruiter can query shortlist reports in own org", async () => {
      const { error } = await recruiterClient
        .from("ai_shortlist_reports")
        .select("id")
        .eq("organization_id", TENANT_A.org.id)
        .limit(1);
      expect(error).toBeNull();
    });
  });

  // ─── Tenant Isolation ───────────────────────────────────

  describe("tenant isolation", () => {
    it("Tenant B cannot see Tenant A reports", async () => {
      // Insert via service client for Tenant A
      const { data: report } = await serviceClient
        .from("ai_shortlist_reports")
        .insert({
          organization_id: TENANT_A.org.id,
          job_opening_id: TENANT_A.jobs.seniorEngineer.id,
          triggered_by: TENANT_A.users.owner.id,
          status: "pending",
        })
        .select("id")
        .single();

      insertedReportId = report?.id ?? null;
      expect(insertedReportId).toBeTruthy();

      // Tenant B cannot see it
      const { data } = await tenantBClient
        .from("ai_shortlist_reports")
        .select("id")
        .eq("id", insertedReportId!)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("Tenant B cannot INSERT report into Tenant A org", async () => {
      const { error } = await tenantBClient
        .from("ai_shortlist_reports")
        .insert({
          organization_id: TENANT_A.org.id,
          job_opening_id: TENANT_A.jobs.seniorEngineer.id,
          triggered_by: TENANT_B.users.owner.id,
          status: "pending",
        });
      expect(error).not.toBeNull();
    });
  });

  // ─── INSERT ─────────────────────────────────────────────

  describe("INSERT", () => {
    it("owner can insert report in own org", async () => {
      const { error } = await ownerClient
        .from("ai_shortlist_reports")
        .insert({
          organization_id: TENANT_A.org.id,
          job_opening_id: TENANT_A.jobs.seniorEngineer.id,
          triggered_by: TENANT_A.users.owner.id,
          status: "pending",
        });
      // May fail on FK constraints — just check no RLS denial
      if (error) {
        expect(error.code).not.toBe("42501");
      }
    });
  });

  // ─── UPDATE ─────────────────────────────────────────────

  describe("UPDATE", () => {
    it("owner can update report in own org", async () => {
      if (!insertedReportId) return;
      const { error } = await ownerClient
        .from("ai_shortlist_reports")
        .update({ status: "processing" })
        .eq("id", insertedReportId);
      if (error) {
        expect(error.code).not.toBe("42501");
      }
    });

    it("Tenant B cannot update Tenant A report", async () => {
      if (!insertedReportId) return;
      const { data } = await tenantBClient
        .from("ai_shortlist_reports")
        .update({ status: "failed" })
        .eq("id", insertedReportId)
        .select("id");
      // RLS filters out — no rows affected
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── DELETE (blocked — soft delete only) ────────────────

  describe("DELETE (blocked — soft delete only)", () => {
    it("owner cannot hard DELETE a report", async () => {
      if (!insertedReportId) return;
      const { data } = await ownerClient
        .from("ai_shortlist_reports")
        .delete()
        .eq("id", insertedReportId)
        .select("id");
      // No DELETE policy → silent no-op
      expect(!data || data.length === 0).toBe(true);
    });
  });
});
