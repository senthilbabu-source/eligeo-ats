/**
 * RLS Tests: scorecard_templates
 * D24 §6.2 — scorecard templates for structured interview feedback
 *
 * Policies:
 *   SELECT: is_org_member(organization_id) AND deleted_at IS NULL
 *   INSERT: organization_id = current_user_org_id() AND has_org_role(..., 'owner', 'admin', 'recruiter', 'hiring_manager')
 *   UPDATE: has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
 *   DELETE: USING (FALSE) — hard deletes blocked
 *
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's templates.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: scorecard_templates", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  // Seed template ID from golden-tenant
  const seedTemplateId = TENANT_A.scorecardTemplates.engineering.id;
  // Track IDs for cleanup
  const cleanupIds: string[] = [];

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    adminClient = await createTestClient(TENANT_A.users.admin.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    hmClient = await createTestClient(TENANT_A.users.hiringManager.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();
  });

  afterAll(async () => {
    for (const id of cleanupIds) {
      await serviceClient.from("scorecard_templates").delete().eq("id", id);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT templates in own org", async () => {
    const { data, error } = await ownerClient
      .from("scorecard_templates")
      .select("id")
      .eq("id", seedTemplateId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedTemplateId);
  });

  it("admin can SELECT templates in own org", async () => {
    const { data, error } = await adminClient
      .from("scorecard_templates")
      .select("id")
      .eq("id", seedTemplateId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedTemplateId);
  });

  it("recruiter can SELECT templates in own org", async () => {
    const { data, error } = await recruiterClient
      .from("scorecard_templates")
      .select("id")
      .eq("id", seedTemplateId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedTemplateId);
  });

  it("hiring_manager can SELECT templates in own org", async () => {
    const { data, error } = await hmClient
      .from("scorecard_templates")
      .select("id")
      .eq("id", seedTemplateId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedTemplateId);
  });

  it("interviewer can SELECT templates in own org", async () => {
    const { data, error } = await interviewerClient
      .from("scorecard_templates")
      .select("id")
      .eq("id", seedTemplateId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedTemplateId);
  });

  it("Tenant B cannot SELECT Tenant A templates", async () => {
    const { data } = await tenantBClient
      .from("scorecard_templates")
      .select("id")
      .eq("id", seedTemplateId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("recruiter can INSERT template in own org", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await recruiterClient.from("scorecard_templates").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      name: "RLS Test Template — Recruiter",
    });
    expect(error).toBeNull();
    cleanupIds.push(tempId);
  });

  it("interviewer cannot INSERT template", async () => {
    const { error } = await interviewerClient.from("scorecard_templates").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      name: "RLS Test Template — Interviewer (should fail)",
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B cannot INSERT into Tenant A templates", async () => {
    const { error } = await tenantBClient.from("scorecard_templates").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      name: "Cross-tenant intrusion template",
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("recruiter can UPDATE template in own org", async () => {
    const { error } = await recruiterClient
      .from("scorecard_templates")
      .update({ name: "Engineering Interview (updated)" })
      .eq("id", seedTemplateId);
    expect(error).toBeNull();

    // Restore original name
    await serviceClient
      .from("scorecard_templates")
      .update({ name: TENANT_A.scorecardTemplates.engineering.name })
      .eq("id", seedTemplateId);
  });

  it("interviewer cannot UPDATE template", async () => {
    const { data } = await interviewerClient
      .from("scorecard_templates")
      .update({ name: "Interviewer hijack" })
      .eq("id", seedTemplateId)
      .select("id");
    // RLS silently filters — update affects 0 rows
    expect(data).toEqual([]);
  });

  it("Tenant B cannot UPDATE Tenant A templates", async () => {
    const { data } = await tenantBClient
      .from("scorecard_templates")
      .update({ name: "Cross-tenant edit" })
      .eq("id", seedTemplateId)
      .select("id");
    expect(data).toEqual([]);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("owner cannot hard-delete template (policy FALSE)", async () => {
    const { data } = await ownerClient
      .from("scorecard_templates")
      .delete()
      .eq("id", seedTemplateId)
      .select("id");
    // USING (FALSE) — delete affects 0 rows for all roles
    expect(data).toEqual([]);
  });
});
