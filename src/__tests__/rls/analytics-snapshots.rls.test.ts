/**
 * RLS Tests: analytics_snapshots
 * D24 §6.2 — org-scoped SELECT, service-role INSERT/UPDATE, no user INSERT
 *
 * Policies (migration 033):
 *   SELECT: is_org_member(organization_id) AND deleted_at IS NULL
 *   INSERT: service role only (WITH CHECK true — no user policy)
 *   UPDATE: service role only (USING true — no user policy)
 *   DELETE: no policy (soft delete only)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: analytics_snapshots", () => {
  let ownerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  let insertedSnapshotId: string | null = null;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();

    // Seed a snapshot via service client for SELECT tests
    const { data } = await serviceClient
      .from("analytics_snapshots")
      .insert({
        organization_id: TENANT_A.org.id,
        snapshot_date: "2026-03-13",
        snapshot_type: "funnel_daily",
        data: { stages: [], totalApplications: 0 },
      })
      .select("id")
      .single();

    insertedSnapshotId = data?.id ?? null;
  });

  afterAll(async () => {
    if (insertedSnapshotId) {
      await serviceClient
        .from("analytics_snapshots")
        .delete()
        .eq("id", insertedSnapshotId);
    }
    clearClientCache();
  });

  // ─── SELECT ─────────────────────────────────────────────

  describe("SELECT", () => {
    it("owner can read snapshots in own org", async () => {
      const { data, error } = await ownerClient
        .from("analytics_snapshots")
        .select("id")
        .eq("organization_id", TENANT_A.org.id)
        .limit(1);
      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    it("Tenant B cannot see Tenant A snapshots", async () => {
      if (!insertedSnapshotId) return;
      const { data } = await tenantBClient
        .from("analytics_snapshots")
        .select("id")
        .eq("id", insertedSnapshotId)
        .maybeSingle();
      expect(data).toBeNull();
    });
  });

  // ─── INSERT (service role only) ─────────────────────────

  describe("INSERT", () => {
    it("user cannot INSERT snapshot (no user INSERT policy)", async () => {
      const { error } = await ownerClient
        .from("analytics_snapshots")
        .insert({
          organization_id: TENANT_A.org.id,
          snapshot_date: "2026-03-14",
          snapshot_type: "velocity_daily",
          data: {},
        });
      // Should fail — RLS denies user inserts
      expect(error).not.toBeNull();
    });

    it("service role can INSERT snapshot", async () => {
      const { data, error } = await serviceClient
        .from("analytics_snapshots")
        .insert({
          organization_id: TENANT_A.org.id,
          snapshot_date: "2026-03-15",
          snapshot_type: "source_daily",
          data: { sources: [] },
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();

      // Clean up
      if (data?.id) {
        await serviceClient
          .from("analytics_snapshots")
          .delete()
          .eq("id", data.id);
      }
    });
  });

  // ─── DELETE (blocked — soft delete only) ────────────────

  describe("DELETE (blocked — soft delete only)", () => {
    it("user cannot hard DELETE a snapshot", async () => {
      if (!insertedSnapshotId) return;
      const { data } = await ownerClient
        .from("analytics_snapshots")
        .delete()
        .eq("id", insertedSnapshotId)
        .select("id");
      // No DELETE policy → silent no-op
      expect(!data || data.length === 0).toBe(true);
    });
  });
});
