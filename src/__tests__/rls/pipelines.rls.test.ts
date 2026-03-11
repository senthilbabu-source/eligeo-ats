/**
 * RLS Tests: pipeline_templates + pipeline_stages
 * D24 §6.2 — 4 ops × 2 tenants
 *
 * Both tables share the same policy pattern (migration 007):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin, recruiter
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

// ─── pipeline_templates ───────────────────────────────────

describe("RLS: pipeline_templates", () => {
  let ownerClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;

  const TEMPLATE_ID = TENANT_A.pipeline.template.id;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
  });

  afterAll(() => clearClientCache());

  describe("tenant isolation", () => {
    it("Tenant A can see own pipeline templates", async () => {
      const { data, error } = await ownerClient
        .from("pipeline_templates")
        .select("id")
        .eq("id", TEMPLATE_ID)
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBe(TEMPLATE_ID);
    });

    it("Tenant B cannot see Tenant A templates", async () => {
      const { data } = await tenantBClient
        .from("pipeline_templates")
        .select("id")
        .eq("id", TEMPLATE_ID)
        .maybeSingle();
      expect(data).toBeNull();
    });
  });

  describe("SELECT", () => {
    it("interviewer can SELECT templates", async () => {
      const { data, error } = await interviewerClient
        .from("pipeline_templates")
        .select("id")
        .limit(1);
      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
    });
  });

  describe("INSERT", () => {
    it("interviewer cannot INSERT templates", async () => {
      const { error } = await interviewerClient
        .from("pipeline_templates")
        .insert({
          organization_id: TENANT_A.org.id,
          name: "Unauthorized Pipeline",
          created_by: TENANT_A.users.interviewer.id,
        });
      expect(error).not.toBeNull();
    });
  });

  describe("UPDATE", () => {
    it("recruiter can UPDATE templates", async () => {
      const { data, error } = await recruiterClient
        .from("pipeline_templates")
        .update({ description: "Updated by recruiter" })
        .eq("id", TEMPLATE_ID)
        .select("id");
      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
    });

    it("interviewer cannot UPDATE templates", async () => {
      const { data } = await interviewerClient
        .from("pipeline_templates")
        .update({ description: "hacked" })
        .eq("id", TEMPLATE_ID)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });

  describe("DELETE", () => {
    it("interviewer cannot DELETE templates", async () => {
      const { data } = await interviewerClient
        .from("pipeline_templates")
        .delete()
        .eq("id", TEMPLATE_ID)
        .select("id");
      expect(!data || data.length === 0).toBe(true);
    });
  });
});

// ─── pipeline_stages ──────────────────────────────────────

describe("RLS: pipeline_stages", () => {
  let ownerClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;

  const STAGE_ID = TENANT_A.pipeline.stages.applied.id;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
  });

  afterAll(() => clearClientCache());

  it("Tenant A can see own pipeline stages", async () => {
    const { data, error } = await ownerClient
      .from("pipeline_stages")
      .select("id")
      .eq("organization_id", TENANT_A.org.id);
    expect(error).toBeNull();
    expect(data!.length).toBe(6); // 6 stages in seed
  });

  it("Tenant B cannot see Tenant A stages", async () => {
    const { data } = await tenantBClient
      .from("pipeline_stages")
      .select("id")
      .eq("organization_id", TENANT_A.org.id);
    expect(!data || data.length === 0).toBe(true);
  });

  it("interviewer cannot INSERT stages", async () => {
    const { error } = await interviewerClient
      .from("pipeline_stages")
      .insert({
        organization_id: TENANT_A.org.id,
        pipeline_template_id: TENANT_A.pipeline.template.id,
        name: "Unauthorized Stage",
        stage_type: "screening",
        stage_order: 99,
      });
    expect(error).not.toBeNull();
  });

  it("interviewer cannot UPDATE stages", async () => {
    const { data } = await interviewerClient
      .from("pipeline_stages")
      .update({ name: "hacked" })
      .eq("id", STAGE_ID)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  it("interviewer cannot DELETE stages", async () => {
    const { data } = await interviewerClient
      .from("pipeline_stages")
      .delete()
      .eq("id", STAGE_ID)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });
});
