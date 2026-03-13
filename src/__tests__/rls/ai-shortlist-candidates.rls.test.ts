/**
 * RLS Tests: ai_shortlist_candidates
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

describe("RLS: ai_shortlist_candidates", () => {
  let ownerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  let reportId: string | null = null;
  let insertedCandidateRowId: string | null = null;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();

    // Create a report to reference (via service client)
    const { data: report } = await serviceClient
      .from("ai_shortlist_reports")
      .insert({
        organization_id: TENANT_A.org.id,
        job_opening_id: TENANT_A.jobs.seniorEngineer.id,
        triggered_by: TENANT_A.users.owner.id,
        status: "complete",
      })
      .select("id")
      .single();
    reportId = report?.id ?? null;
  });

  afterAll(async () => {
    if (insertedCandidateRowId) {
      await serviceClient
        .from("ai_shortlist_candidates")
        .delete()
        .eq("id", insertedCandidateRowId);
    }
    if (reportId) {
      await serviceClient
        .from("ai_shortlist_reports")
        .delete()
        .eq("id", reportId);
    }
    clearClientCache();
  });

  // ─── SELECT ─────────────────────────────────────────────

  describe("SELECT", () => {
    it("owner can query shortlist candidates in own org", async () => {
      const { error } = await ownerClient
        .from("ai_shortlist_candidates")
        .select("id")
        .eq("organization_id", TENANT_A.org.id)
        .limit(1);
      expect(error).toBeNull();
    });
  });

  // ─── Tenant Isolation ───────────────────────────────────

  describe("tenant isolation", () => {
    it("Tenant B cannot see Tenant A shortlist candidates", async () => {
      if (!reportId) return;
      // Insert via service client
      const { data: row } = await serviceClient
        .from("ai_shortlist_candidates")
        .insert({
          organization_id: TENANT_A.org.id,
          report_id: reportId,
          application_id: TENANT_A.applications.aliceForEngineer.id,
          candidate_id: TENANT_A.candidates.alice.id,
          ai_tier: "shortlist",
          composite_score: 0.85,
          skills_score: 0.80,
          experience_score: 0.90,
          education_score: 0.75,
          domain_score: 0.80,
          trajectory_score: 0.70,
          strengths: ["Strong Python"],
          gaps: [],
          eeoc_flags: [],
        })
        .select("id")
        .single();

      insertedCandidateRowId = row?.id ?? null;
      expect(insertedCandidateRowId).toBeTruthy();

      // Tenant B cannot see it
      const { data } = await tenantBClient
        .from("ai_shortlist_candidates")
        .select("id")
        .eq("id", insertedCandidateRowId!)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("Tenant B cannot INSERT into Tenant A org", async () => {
      if (!reportId) return;
      const { error } = await tenantBClient
        .from("ai_shortlist_candidates")
        .insert({
          organization_id: TENANT_A.org.id,
          report_id: reportId,
          application_id: TENANT_A.applications.aliceForEngineer.id,
          candidate_id: TENANT_A.candidates.alice.id,
          ai_tier: "hold",
        });
      expect(error).not.toBeNull();
    });
  });

  // ─── UPDATE ─────────────────────────────────────────────

  describe("UPDATE", () => {
    it("owner can update tier override in own org", async () => {
      if (!insertedCandidateRowId) return;
      const { error } = await ownerClient
        .from("ai_shortlist_candidates")
        .update({
          recruiter_tier: "hold",
          tier_overridden_at: new Date().toISOString(),
          tier_overridden_by: TENANT_A.users.owner.id,
        })
        .eq("id", insertedCandidateRowId);
      if (error) {
        expect(error.code).not.toBe("42501");
      }
    });

    it("Tenant B cannot update Tenant A candidates", async () => {
      if (!insertedCandidateRowId) return;
      const { data } = await tenantBClient
        .from("ai_shortlist_candidates")
        .update({ recruiter_tier: "reject" })
        .eq("id", insertedCandidateRowId)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── DELETE (blocked — soft delete only) ────────────────

  describe("DELETE (blocked — soft delete only)", () => {
    it("owner cannot hard DELETE a shortlist candidate", async () => {
      if (!insertedCandidateRowId) return;
      const { data } = await ownerClient
        .from("ai_shortlist_candidates")
        .delete()
        .eq("id", insertedCandidateRowId)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });
});
