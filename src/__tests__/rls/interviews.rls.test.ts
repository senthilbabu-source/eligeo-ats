/**
 * RLS Tests: interviews
 * D24 §6.2 — interview scheduling and management
 *
 * Policies (migration 026):
 *   SELECT: is_org_member(organization_id) AND deleted_at IS NULL — all org members
 *   INSERT: organization_id = current_user_org_id() AND has_org_role(..., 'owner', 'admin', 'recruiter', 'hiring_manager')
 *   UPDATE: has_org_role(..., 'owner', 'admin', 'recruiter', 'hiring_manager') OR interviewer_id = auth.uid()
 *   DELETE: USING (FALSE) — hard deletes blocked for everyone
 *
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's interviews.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: interviews", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  // Seed interview IDs from golden-tenant (already in DB via seed.sql)
  const aliceScreeningId = TENANT_A.interviews.aliceScreening.id;
  const aliceTechnicalId = TENANT_A.interviews.aliceTechnical.id;

  // Track IDs for cleanup (INSERT tests)
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
      await serviceClient.from("interviews").delete().eq("id", id);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT interviews in own org", async () => {
    const { data, error } = await ownerClient
      .from("interviews")
      .select("id")
      .eq("id", aliceScreeningId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(aliceScreeningId);
  });

  it("admin can SELECT interviews in own org", async () => {
    const { data, error } = await adminClient
      .from("interviews")
      .select("id")
      .eq("id", aliceScreeningId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(aliceScreeningId);
  });

  it("recruiter can SELECT interviews in own org", async () => {
    const { data, error } = await recruiterClient
      .from("interviews")
      .select("id")
      .eq("id", aliceScreeningId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(aliceScreeningId);
  });

  it("hiring_manager can SELECT interviews in own org", async () => {
    const { data, error } = await hmClient
      .from("interviews")
      .select("id")
      .eq("id", aliceScreeningId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(aliceScreeningId);
  });

  it("interviewer can SELECT interviews in own org", async () => {
    const { data, error } = await interviewerClient
      .from("interviews")
      .select("id")
      .eq("id", aliceScreeningId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(aliceScreeningId);
  });

  it("Tenant B cannot SELECT Tenant A interviews", async () => {
    const { data } = await tenantBClient
      .from("interviews")
      .select("id")
      .eq("id", aliceScreeningId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("recruiter can INSERT interview", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await recruiterClient.from("interviews").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      job_id: TENANT_A.jobs.seniorEngineer.id,
      interviewer_id: TENANT_A.users.recruiter.id,
      interview_type: "phone_screen",
      status: "scheduled",
      duration_minutes: 30,
      created_by: TENANT_A.users.recruiter.id,
    });
    expect(error).toBeNull();
    cleanupIds.push(tempId);
  });

  it("interviewer CANNOT INSERT interview", async () => {
    const { error } = await interviewerClient.from("interviews").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      job_id: TENANT_A.jobs.seniorEngineer.id,
      interviewer_id: TENANT_A.users.interviewer.id,
      interview_type: "technical",
      status: "scheduled",
      duration_minutes: 60,
      created_by: TENANT_A.users.interviewer.id,
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B cannot INSERT into Tenant A interviews", async () => {
    const { error } = await tenantBClient.from("interviews").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      job_id: TENANT_A.jobs.seniorEngineer.id,
      interviewer_id: TENANT_B.users.owner.id,
      interview_type: "phone_screen",
      status: "scheduled",
      duration_minutes: 30,
      created_by: TENANT_B.users.owner.id,
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("recruiter can UPDATE any interview in own org", async () => {
    const { error } = await recruiterClient
      .from("interviews")
      .update({ notes: "Updated by recruiter" })
      .eq("id", aliceScreeningId);
    expect(error).toBeNull();
  });

  it("interviewer can UPDATE their own interview (interviewer_id = self)", async () => {
    // aliceTechnical has interviewer_id = Taylor (interviewer user)
    const { data, error } = await interviewerClient
      .from("interviews")
      .update({ notes: "Updated by interviewer (own interview)" })
      .eq("id", aliceTechnicalId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(aliceTechnicalId);
  });

  it("interviewer CANNOT UPDATE someone else's interview", async () => {
    // aliceScreening has interviewer_id = Roshelle (recruiter), not Taylor
    const { data } = await interviewerClient
      .from("interviews")
      .update({ notes: "Interviewer hijack" })
      .eq("id", aliceScreeningId)
      .select("id");
    // RLS silently filters — update affects 0 rows
    expect(data).toEqual([]);
  });

  it("Tenant B cannot UPDATE Tenant A interviews", async () => {
    const { data } = await tenantBClient
      .from("interviews")
      .update({ notes: "Cross-tenant edit" })
      .eq("id", aliceScreeningId)
      .select("id");
    expect(data).toEqual([]);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("owner CANNOT hard-delete interviews (policy is FALSE)", async () => {
    const { data } = await ownerClient
      .from("interviews")
      .delete()
      .eq("id", aliceScreeningId)
      .select("id");
    expect(data).toEqual([]);
  });

  it("Tenant B cannot DELETE Tenant A interviews", async () => {
    const { data } = await tenantBClient
      .from("interviews")
      .delete()
      .eq("id", aliceScreeningId)
      .select("id");
    expect(data).toEqual([]);
  });
});
