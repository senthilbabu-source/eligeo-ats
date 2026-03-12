/**
 * RLS Tests: scorecard_attributes
 * D24 §6.2 — scorecard attribute definitions within templates
 *
 * Policies (migration 026):
 *   SELECT: is_org_member(organization_id) AND deleted_at IS NULL
 *   INSERT: organization_id = current_user_org_id() AND has_org_role(..., 'owner','admin','recruiter','hiring_manager')
 *   UPDATE: has_org_role(..., 'owner','admin','recruiter','hiring_manager')
 *   DELETE: USING (FALSE) — hard deletes blocked
 *
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's attributes.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: scorecard_attributes", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  const seedAttributeId = TENANT_A.scorecardAttributes.systemDesign.id;
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
      await serviceClient.from("scorecard_attributes").delete().eq("id", id);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT attributes in own org", async () => {
    const { data, error } = await ownerClient
      .from("scorecard_attributes")
      .select("id")
      .eq("id", seedAttributeId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedAttributeId);
  });

  it("recruiter can SELECT attributes in own org", async () => {
    const { data, error } = await recruiterClient
      .from("scorecard_attributes")
      .select("id")
      .eq("id", seedAttributeId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedAttributeId);
  });

  it("interviewer can SELECT attributes in own org", async () => {
    const { data, error } = await interviewerClient
      .from("scorecard_attributes")
      .select("id")
      .eq("id", seedAttributeId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedAttributeId);
  });

  it("Tenant B cannot SELECT Tenant A attributes", async () => {
    const { data } = await tenantBClient
      .from("scorecard_attributes")
      .select("id")
      .eq("id", seedAttributeId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("recruiter can INSERT attribute", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await recruiterClient.from("scorecard_attributes").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      category_id: TENANT_A.scorecardCategories.technicalSkills.id,
      name: "Algorithm Design",
      position: 10,
    });
    expect(error).toBeNull();
    cleanupIds.push(tempId);
  });

  it("interviewer CANNOT INSERT attribute", async () => {
    const { error } = await interviewerClient.from("scorecard_attributes").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      category_id: TENANT_A.scorecardCategories.technicalSkills.id,
      name: "Interviewer Attribute",
      position: 11,
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B cannot INSERT into Tenant A attributes", async () => {
    const { error } = await tenantBClient.from("scorecard_attributes").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      category_id: TENANT_A.scorecardCategories.technicalSkills.id,
      name: "Cross-tenant intrusion",
      position: 12,
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("admin can UPDATE attribute", async () => {
    const { error } = await adminClient
      .from("scorecard_attributes")
      .update({ name: "System Design (Updated)" })
      .eq("id", seedAttributeId);
    expect(error).toBeNull();

    // Restore original name
    await serviceClient
      .from("scorecard_attributes")
      .update({ name: "System Design" })
      .eq("id", seedAttributeId);
  });

  it("interviewer CANNOT UPDATE attribute", async () => {
    const { data } = await interviewerClient
      .from("scorecard_attributes")
      .update({ name: "Interviewer Hijack" })
      .eq("id", seedAttributeId)
      .select("id");
    // RLS silently filters — update affects 0 rows
    expect(data).toEqual([]);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("owner cannot hard-delete attributes (policy FALSE)", async () => {
    const { data } = await ownerClient
      .from("scorecard_attributes")
      .delete()
      .eq("id", seedAttributeId)
      .select("id");
    // RLS silently filters — delete affects 0 rows
    expect(data).toEqual([]);
  });
});
