/**
 * RLS Tests: applications + application_stage_history
 * D24 §6.2 — generator pattern
 *
 * applications policies (migration 011, cross-cut 013):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter, hiring_manager
 *   UPDATE: owner, admin, recruiter, hiring_manager
 *   DELETE: owner, admin only
 *
 * application_stage_history (append-only):
 *   SELECT: is_org_member
 *   INSERT: owner, admin, recruiter, hiring_manager
 *   UPDATE: FALSE
 *   DELETE: FALSE
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: applications", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;

  const APP_ID = TENANT_A.applications.aliceForEngineer.id;

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
    it("Tenant B cannot see Tenant A applications", async () => {
      const { data } = await tenantBClient
        .from("applications")
        .select("id")
        .eq("id", APP_ID)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("Tenant B cannot INSERT application into Tenant A org", async () => {
      const { error } = await tenantBClient.from("applications").insert({
        organization_id: TENANT_A.org.id,
        candidate_id: TENANT_A.candidates.alice.id,
        job_opening_id: TENANT_A.jobs.seniorEngineer.id,
        current_stage_id: TENANT_A.pipeline.stages.applied.id,
        status: "active",
        source: "Direct",
      });
      expect(error).not.toBeNull();
    });
  });

  // ─── SELECT: all roles ──────────────────────────────────

  describe("SELECT", () => {
    for (const [name, getClient] of [
      ["owner", () => ownerClient],
      ["admin", () => adminClient],
      ["recruiter", () => recruiterClient],
      ["hiring_manager", () => hmClient],
      ["interviewer", () => interviewerClient],
    ] as const) {
      it(`${name} can SELECT applications`, async () => {
        const { data, error } = await (getClient as () => SupabaseClient)()
          .from("applications")
          .select("id")
          .limit(1);
        expect(error).toBeNull();
        expect(data!.length).toBeGreaterThan(0);
      });
    }
  });

  // ─── UPDATE: owner, admin, recruiter, hiring_manager ────

  describe("UPDATE", () => {
    for (const [name, getClient] of [
      ["owner", () => ownerClient],
      ["admin", () => adminClient],
      ["recruiter", () => recruiterClient],
      ["hiring_manager", () => hmClient],
    ] as const) {
      it(`${name} can UPDATE applications`, async () => {
        const { data, error } = await (getClient as () => SupabaseClient)()
          .from("applications")
          .update({ source: "LinkedIn" })
          .eq("id", APP_ID)
          .select("id");
        expect(error).toBeNull();
        expect(data!.length).toBeGreaterThan(0);
      });
    }

    it("interviewer cannot UPDATE applications", async () => {
      const { data } = await interviewerClient
        .from("applications")
        .update({ source: "hacked" })
        .eq("id", APP_ID)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });

  // ─── DELETE: owner, admin only ──────────────────────────

  describe("DELETE", () => {
    it("recruiter cannot DELETE applications", async () => {
      const { data } = await recruiterClient
        .from("applications")
        .delete()
        .eq("id", APP_ID)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });

    it("interviewer cannot DELETE applications", async () => {
      const { data } = await interviewerClient
        .from("applications")
        .delete()
        .eq("id", APP_ID)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });
});

// ─── application_stage_history (append-only) ──────────────

describe("RLS: application_stage_history", () => {
  let ownerClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
  });

  afterAll(() => clearClientCache());

  it("owner can SELECT stage history", async () => {
    const { data, error } = await ownerClient
      .from("application_stage_history")
      .select("id")
      .limit(1);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("Tenant B cannot see Tenant A stage history", async () => {
    const { data } = await tenantBClient
      .from("application_stage_history")
      .select("id")
      .eq("organization_id", TENANT_A.org.id);
    expect(!data || data.length === 0).toBe(true);
  });

  it("UPDATE is denied (append-only)", async () => {
    const { data } = await ownerClient
      .from("application_stage_history")
      .update({ notes: "hacked" })
      .eq("organization_id", TENANT_A.org.id)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  it("DELETE is denied (append-only)", async () => {
    const { data } = await ownerClient
      .from("application_stage_history")
      .delete()
      .eq("organization_id", TENANT_A.org.id)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });
});
