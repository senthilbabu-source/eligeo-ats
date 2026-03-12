/**
 * RLS Tests: offer_templates
 * D24 §6.2 — Phase 4 (Offers)
 *
 * Policies (from schema/06-offers.md):
 *   SELECT: is_org_member AND deleted_at IS NULL AND has_org_role(owner, admin, recruiter, hiring_manager)
 *   INSERT: organization_id = current_user_org_id() AND has_org_role(owner, admin, recruiter)
 *   UPDATE: has_org_role(owner, admin, recruiter) AND organization_id = current_user_org_id()
 *   DELETE: FALSE (soft-delete only)
 *
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's templates.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import {
  createTestClient,
  createServiceClient,
  clearClientCache,
} from "../helpers";

describe("RLS: offer_templates", () => {
  let ownerClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  const templateId = TENANT_A.offerTemplates.engineering.id;
  const tenantBTemplateId = TENANT_B.offerTemplates.sales.id;
  const cleanupIds: string[] = [];

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    hmClient = await createTestClient(TENANT_A.users.hiringManager.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();
  });

  afterAll(async () => {
    for (const id of cleanupIds) {
      await serviceClient.from("offer_templates").delete().eq("id", id);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT templates in own org", async () => {
    const { data, error } = await ownerClient
      .from("offer_templates")
      .select("id")
      .eq("id", templateId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(templateId);
  });

  it("recruiter can SELECT templates in own org", async () => {
    const { data, error } = await recruiterClient
      .from("offer_templates")
      .select("id")
      .eq("id", templateId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(templateId);
  });

  it("hiring_manager can SELECT templates in own org", async () => {
    const { data, error } = await hmClient
      .from("offer_templates")
      .select("id")
      .eq("id", templateId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(templateId);
  });

  it("interviewer CANNOT SELECT templates (excluded by role)", async () => {
    const { data } = await interviewerClient
      .from("offer_templates")
      .select("id")
      .eq("id", templateId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("Tenant B CANNOT SELECT Tenant A templates", async () => {
    const { data } = await tenantBClient
      .from("offer_templates")
      .select("id")
      .eq("id", templateId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("owner can INSERT templates in own org", async () => {
    const id = crypto.randomUUID();
    cleanupIds.push(id);
    const { error } = await ownerClient.from("offer_templates").insert({
      id,
      organization_id: TENANT_A.org.id,
      name: "RLS Test Template (owner)",
      compensation: { base_salary: 100000, currency: "USD", period: "annual" },
    });
    expect(error).toBeNull();
  });

  it("recruiter can INSERT templates in own org", async () => {
    const id = crypto.randomUUID();
    cleanupIds.push(id);
    const { error } = await recruiterClient.from("offer_templates").insert({
      id,
      organization_id: TENANT_A.org.id,
      name: "RLS Test Template (recruiter)",
      compensation: { base_salary: 90000, currency: "USD", period: "annual" },
    });
    expect(error).toBeNull();
  });

  it("hiring_manager CANNOT INSERT templates", async () => {
    const { error } = await hmClient.from("offer_templates").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      name: "Should Fail",
      compensation: {},
    });
    expect(error).not.toBeNull();
  });

  it("interviewer CANNOT INSERT templates", async () => {
    const { error } = await interviewerClient.from("offer_templates").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      name: "Should Fail",
      compensation: {},
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B CANNOT INSERT into Tenant A org", async () => {
    const { error } = await tenantBClient.from("offer_templates").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      name: "Cross-tenant attack",
      compensation: {},
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("owner can UPDATE templates in own org", async () => {
    const { data } = await ownerClient
      .from("offer_templates")
      .update({ name: "Updated by owner" })
      .eq("id", templateId)
      .select("id");
    expect(data).toHaveLength(1);
  });

  it("hiring_manager CANNOT UPDATE templates", async () => {
    const { data } = await hmClient
      .from("offer_templates")
      .update({ name: "Should not update" })
      .eq("id", templateId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  it("Tenant B CANNOT UPDATE Tenant A templates", async () => {
    const { data } = await tenantBClient
      .from("offer_templates")
      .update({ name: "Cross-tenant attack" })
      .eq("id", templateId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("owner CANNOT hard-delete templates (policy = FALSE)", async () => {
    const { data } = await ownerClient
      .from("offer_templates")
      .delete()
      .eq("id", templateId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  it("Tenant B CANNOT hard-delete Tenant A templates", async () => {
    const { data } = await tenantBClient
      .from("offer_templates")
      .delete()
      .eq("id", templateId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  // ─── Restore modified template ────────────────────────────

  afterAll(async () => {
    await serviceClient
      .from("offer_templates")
      .update({ name: TENANT_A.offerTemplates.engineering.name })
      .eq("id", templateId);
  });
});
