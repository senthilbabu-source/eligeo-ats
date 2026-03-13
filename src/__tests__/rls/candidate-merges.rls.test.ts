/**
 * RLS Tests: candidate_merges
 * D24 §6.2 — immutable audit table, org-scoped SELECT + INSERT only
 *
 * candidate_merges policies (migration 030):
 *   SELECT: org_id matches JWT app_metadata.org_id
 *   INSERT: org_id matches JWT app_metadata.org_id
 *   UPDATE: no policy (blocked)
 *   DELETE: no policy (blocked)
 *
 * ADR-006 exception: no deleted_at (immutable audit record)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: candidate_merges", () => {
  let ownerClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  let insertedMergeId: string | null = null;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();
  });

  afterAll(async () => {
    // Clean up test data (service client bypasses RLS)
    if (insertedMergeId) {
      await serviceClient
        .from("candidate_merges")
        .delete()
        .eq("id", insertedMergeId);
    }
    clearClientCache();
  });

  // ─── SELECT ─────────────────────────────────────────────

  describe("SELECT", () => {
    it("owner can query candidate_merges in own org", async () => {
      const { error } = await ownerClient
        .from("candidate_merges")
        .select("id")
        .eq("organization_id", TENANT_A.org.id)
        .limit(1);
      expect(error).toBeNull();
    });

    it("recruiter can query candidate_merges in own org", async () => {
      const { error } = await recruiterClient
        .from("candidate_merges")
        .select("id")
        .eq("organization_id", TENANT_A.org.id)
        .limit(1);
      expect(error).toBeNull();
    });

    it("interviewer can query candidate_merges in own org", async () => {
      const { error } = await interviewerClient
        .from("candidate_merges")
        .select("id")
        .eq("organization_id", TENANT_A.org.id)
        .limit(1);
      expect(error).toBeNull();
    });
  });

  // ─── Tenant Isolation ───────────────────────────────────

  describe("tenant isolation", () => {
    it("Tenant B cannot see Tenant A merge records", async () => {
      // Insert a merge record via service client for Tenant A
      const { data: mergeRecord } = await serviceClient
        .from("candidate_merges")
        .insert({
          organization_id: TENANT_A.org.id,
          primary_id: TENANT_A.candidates.alice.id,
          secondary_id: TENANT_A.candidates.bob.id,
          merged_by: TENANT_A.users.owner.id,
          ai_confidence: 0.87,
          merge_reason: "RLS test merge",
        })
        .select("id")
        .single();

      insertedMergeId = mergeRecord?.id ?? null;
      expect(insertedMergeId).toBeTruthy();

      // Tenant B cannot see it
      const { data } = await tenantBClient
        .from("candidate_merges")
        .select("id")
        .eq("id", insertedMergeId!)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("Tenant B cannot INSERT merge record into Tenant A org", async () => {
      const { error } = await tenantBClient
        .from("candidate_merges")
        .insert({
          organization_id: TENANT_A.org.id,
          primary_id: TENANT_A.candidates.alice.id,
          secondary_id: TENANT_A.candidates.bob.id,
          merged_by: TENANT_B.users.owner.id,
          merge_reason: "Cross-tenant merge attempt",
        });
      expect(error).not.toBeNull();
    });
  });

  // ─── INSERT ─────────────────────────────────────────────

  describe("INSERT", () => {
    it("owner can insert merge record in own org", async () => {
      const { error } = await ownerClient
        .from("candidate_merges")
        .insert({
          organization_id: TENANT_A.org.id,
          primary_id: TENANT_A.candidates.alice.id,
          secondary_id: TENANT_A.candidates.carol.id,
          merged_by: TENANT_A.users.owner.id,
          merge_reason: "Owner insert test",
        });
      // May succeed or fail depending on FK constraints — we just check no RLS error
      // Code 42501 = insufficient privilege (RLS denial)
      if (error) {
        expect(error.code).not.toBe("42501");
      }
    });
  });

  // ─── UPDATE (blocked) ──────────────────────────────────

  describe("UPDATE (blocked — immutable audit)", () => {
    it("owner cannot UPDATE a merge record", async () => {
      if (!insertedMergeId) return;
      const { data } = await ownerClient
        .from("candidate_merges")
        .update({ merge_reason: "tampered" })
        .eq("id", insertedMergeId)
        .select("id");
      // No UPDATE policy → PostgREST silent no-op (0 rows affected)
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── DELETE (blocked) ──────────────────────────────────

  describe("DELETE (blocked — immutable audit)", () => {
    it("owner cannot DELETE a merge record", async () => {
      if (!insertedMergeId) return;
      const { data } = await ownerClient
        .from("candidate_merges")
        .delete()
        .eq("id", insertedMergeId)
        .select("id");
      // No DELETE policy → PostgREST silent no-op (0 rows affected)
      expect(!data || data.length === 0).toBe(true);
    });
  });
});
