/**
 * RLS Tests: email_templates
 * D24 §6.2 — Wave F notification cluster
 *
 * Policies (from D07 schema doc):
 *   SELECT: is_org_member(organization_id) AND deleted_at IS NULL
 *   INSERT: has_org_role(..., 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id()
 *   UPDATE: has_org_role(..., 'owner', 'admin', 'recruiter') AND organization_id = current_user_org_id()
 *   DELETE: has_org_role(..., 'owner', 'admin') AND organization_id = current_user_org_id() AND is_system = FALSE
 *
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's templates.
 * System template protection: system templates cannot be deleted by anyone.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import {
  createTestClient,
  createServiceClient,
  clearClientCache,
} from "../helpers";

describe("RLS: email_templates", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  const systemTemplateId = TENANT_A.emailTemplates.interviewInvite.id;
  const customTemplateId = TENANT_A.emailTemplates.customScreening.id;
  const tenantBTemplateId = TENANT_B.emailTemplates.interviewInvite.id;
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
      await serviceClient.from("email_templates").delete().eq("id", id);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT templates in own org", async () => {
    const { data, error } = await ownerClient
      .from("email_templates")
      .select("id")
      .eq("id", systemTemplateId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(systemTemplateId);
  });

  it("recruiter can SELECT templates in own org", async () => {
    const { data, error } = await recruiterClient
      .from("email_templates")
      .select("id")
      .eq("id", systemTemplateId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(systemTemplateId);
  });

  it("interviewer can SELECT templates in own org", async () => {
    const { data, error } = await interviewerClient
      .from("email_templates")
      .select("id")
      .eq("id", systemTemplateId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(systemTemplateId);
  });

  it("Tenant B cannot SELECT Tenant A templates", async () => {
    const { data } = await tenantBClient
      .from("email_templates")
      .select("id")
      .eq("id", systemTemplateId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("Tenant A cannot SELECT Tenant B templates", async () => {
    const { data } = await ownerClient
      .from("email_templates")
      .select("id")
      .eq("id", tenantBTemplateId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("owner can INSERT template in own org", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await ownerClient.from("email_templates").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      name: "RLS Test — Owner Insert",
      subject: "Test Subject",
      body_html: "<p>Test</p>",
      category: "custom",
    });
    expect(error).toBeNull();
    cleanupIds.push(tempId);
  });

  it("recruiter can INSERT template in own org", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await recruiterClient.from("email_templates").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      name: "RLS Test — Recruiter Insert",
      subject: "Test Subject",
      body_html: "<p>Test</p>",
      category: "custom",
    });
    expect(error).toBeNull();
    cleanupIds.push(tempId);
  });

  it("hiring_manager cannot INSERT template", async () => {
    const { error } = await hmClient.from("email_templates").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      name: "RLS Test — HM Insert (should fail)",
      subject: "Test",
      body_html: "<p>Test</p>",
      category: "custom",
    });
    expect(error).not.toBeNull();
  });

  it("interviewer cannot INSERT template", async () => {
    const { error } = await interviewerClient.from("email_templates").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      name: "RLS Test — Interviewer Insert (should fail)",
      subject: "Test",
      body_html: "<p>Test</p>",
      category: "custom",
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B cannot INSERT into Tenant A org", async () => {
    const { error } = await tenantBClient.from("email_templates").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      name: "Cross-tenant intrusion",
      subject: "Intrusion",
      body_html: "<p>Hack</p>",
      category: "custom",
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("recruiter can UPDATE template in own org", async () => {
    const { data, error } = await recruiterClient
      .from("email_templates")
      .update({ name: "Interview Invitation (updated)" })
      .eq("id", systemTemplateId)
      .select("id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);

    // Restore
    await serviceClient
      .from("email_templates")
      .update({ name: TENANT_A.emailTemplates.interviewInvite.name })
      .eq("id", systemTemplateId);
  });

  it("hiring_manager cannot UPDATE template", async () => {
    const { data } = await hmClient
      .from("email_templates")
      .update({ name: "HM hijack" })
      .eq("id", systemTemplateId)
      .select("id");
    expect(data).toEqual([]);
  });

  it("Tenant B cannot UPDATE Tenant A templates", async () => {
    const { data } = await tenantBClient
      .from("email_templates")
      .update({ name: "Cross-tenant edit" })
      .eq("id", systemTemplateId)
      .select("id");
    expect(data).toEqual([]);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("admin can DELETE non-system template", async () => {
    // Insert a disposable custom template via service client
    const disposableId = crypto.randomUUID();
    await serviceClient.from("email_templates").insert({
      id: disposableId,
      organization_id: TENANT_A.org.id,
      name: "Disposable for delete test",
      subject: "Test",
      body_html: "<p>Disposable</p>",
      category: "custom",
      is_system: false,
    });

    const { data, error } = await adminClient
      .from("email_templates")
      .delete()
      .eq("id", disposableId)
      .select("id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("owner cannot DELETE system template", async () => {
    const { data } = await ownerClient
      .from("email_templates")
      .delete()
      .eq("id", systemTemplateId)
      .select("id");
    // is_system = TRUE blocks delete
    expect(data).toEqual([]);
  });

  it("recruiter cannot DELETE template (admin+ only)", async () => {
    const { data } = await recruiterClient
      .from("email_templates")
      .delete()
      .eq("id", customTemplateId)
      .select("id");
    expect(data).toEqual([]);
  });

  it("Tenant B cannot DELETE Tenant A templates", async () => {
    const { data } = await tenantBClient
      .from("email_templates")
      .delete()
      .eq("id", customTemplateId)
      .select("id");
    expect(data).toEqual([]);
  });
});
