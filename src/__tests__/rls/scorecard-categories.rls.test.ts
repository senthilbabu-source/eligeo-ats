/**
 * RLS Tests: scorecard_categories
 * D24 §6.2 — scorecard categories within templates
 *
 * Policies:
 *   SELECT: is_org_member(organization_id) AND deleted_at IS NULL
 *   INSERT: organization_id = current_user_org_id() AND has_org_role(..., 'owner', 'admin', 'recruiter', 'hiring_manager')
 *   UPDATE: has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
 *   DELETE: USING (FALSE) — hard deletes blocked
 *
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's categories.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: scorecard_categories", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  // Seed category ID from golden-tenant
  const seedCategoryId = TENANT_A.scorecardCategories.technicalSkills.id;
  const seedTemplateId = TENANT_A.scorecardTemplates.engineering.id;
  // Track IDs for cleanup
  const cleanupIds: string[] = [];

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    adminClient = await createTestClient(TENANT_A.users.admin.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();
  });

  afterAll(async () => {
    for (const id of cleanupIds) {
      await serviceClient.from("scorecard_categories").delete().eq("id", id);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT categories in own org", async () => {
    const { data, error } = await ownerClient
      .from("scorecard_categories")
      .select("id")
      .eq("id", seedCategoryId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedCategoryId);
  });

  it("recruiter can SELECT categories in own org", async () => {
    const { data, error } = await recruiterClient
      .from("scorecard_categories")
      .select("id")
      .eq("id", seedCategoryId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedCategoryId);
  });

  it("interviewer can SELECT categories in own org", async () => {
    const { data, error } = await interviewerClient
      .from("scorecard_categories")
      .select("id")
      .eq("id", seedCategoryId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedCategoryId);
  });

  it("Tenant B cannot SELECT Tenant A categories", async () => {
    const { data } = await tenantBClient
      .from("scorecard_categories")
      .select("id")
      .eq("id", seedCategoryId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("recruiter can INSERT category in own org", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await recruiterClient.from("scorecard_categories").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      template_id: seedTemplateId,
      name: "RLS Test Category — Recruiter",
      position: 99,
      weight: 1.0,
    });
    expect(error).toBeNull();
    cleanupIds.push(tempId);
  });

  it("interviewer cannot INSERT category", async () => {
    const { error } = await interviewerClient.from("scorecard_categories").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      template_id: seedTemplateId,
      name: "RLS Test Category — Interviewer (should fail)",
      position: 99,
      weight: 1.0,
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B cannot INSERT into Tenant A categories", async () => {
    const { error } = await tenantBClient.from("scorecard_categories").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      template_id: seedTemplateId,
      name: "Cross-tenant intrusion category",
      position: 99,
      weight: 1.0,
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("admin can UPDATE category in own org", async () => {
    const { error } = await adminClient
      .from("scorecard_categories")
      .update({ name: "Technical Skills (updated)" })
      .eq("id", seedCategoryId);
    expect(error).toBeNull();

    // Restore original name
    await serviceClient
      .from("scorecard_categories")
      .update({ name: TENANT_A.scorecardCategories.technicalSkills.name })
      .eq("id", seedCategoryId);
  });

  it("interviewer cannot UPDATE category", async () => {
    const { data } = await interviewerClient
      .from("scorecard_categories")
      .update({ name: "Interviewer hijack" })
      .eq("id", seedCategoryId)
      .select("id");
    // RLS silently filters — update affects 0 rows
    expect(data).toEqual([]);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("owner cannot hard-delete category (policy FALSE)", async () => {
    const { data } = await ownerClient
      .from("scorecard_categories")
      .delete()
      .eq("id", seedCategoryId)
      .select("id");
    // USING (FALSE) — delete affects 0 rows for all roles
    expect(data).toEqual([]);
  });
});
