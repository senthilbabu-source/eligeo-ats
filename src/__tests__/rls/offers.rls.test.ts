/**
 * RLS Tests: offers
 * D24 §6.2 — Phase 4 (Offers)
 *
 * Policies (from schema/06-offers.md):
 *   SELECT: is_org_member AND deleted_at IS NULL AND has_org_role(owner, admin, recruiter, hiring_manager)
 *   INSERT: organization_id = current_user_org_id() AND has_org_role(owner, admin, recruiter)
 *   UPDATE: has_org_role(owner, admin, recruiter) AND organization_id = current_user_org_id()
 *   DELETE: FALSE (soft-delete only)
 *
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's offers.
 * Role boundary: interviewer has no offer access.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import {
  createTestClient,
  createServiceClient,
  clearClientCache,
} from "../helpers";

describe("RLS: offers", () => {
  let ownerClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  const offerId = TENANT_A.offers.aliceDraft.id;
  const _tenantBOfferId = TENANT_B.offers.daveDraft.id;
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
      await serviceClient.from("offers").delete().eq("id", id);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT offers in own org", async () => {
    const { data, error } = await ownerClient
      .from("offers")
      .select("id")
      .eq("id", offerId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(offerId);
  });

  it("recruiter can SELECT offers in own org", async () => {
    const { data, error } = await recruiterClient
      .from("offers")
      .select("id")
      .eq("id", offerId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(offerId);
  });

  it("hiring_manager can SELECT offers in own org", async () => {
    const { data, error } = await hmClient
      .from("offers")
      .select("id")
      .eq("id", offerId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(offerId);
  });

  it("interviewer CANNOT SELECT offers (excluded by role)", async () => {
    const { data } = await interviewerClient
      .from("offers")
      .select("id")
      .eq("id", offerId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("Tenant B CANNOT SELECT Tenant A offers", async () => {
    const { data } = await tenantBClient
      .from("offers")
      .select("id")
      .eq("id", offerId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("recruiter can INSERT offers in own org", async () => {
    const id = crypto.randomUUID();
    cleanupIds.push(id);
    const { error } = await recruiterClient.from("offers").insert({
      id,
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      candidate_id: TENANT_A.candidates.alice.id,
      job_id: TENANT_A.jobs.seniorEngineer.id,
      compensation: { base_salary: 115000, currency: "USD", period: "annual" },
    });
    expect(error).toBeNull();
  });

  it("hiring_manager CANNOT INSERT offers", async () => {
    const { error } = await hmClient.from("offers").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      candidate_id: TENANT_A.candidates.alice.id,
      job_id: TENANT_A.jobs.seniorEngineer.id,
      compensation: { base_salary: 100000, currency: "USD", period: "annual" },
    });
    expect(error).not.toBeNull();
  });

  it("interviewer CANNOT INSERT offers", async () => {
    const { error } = await interviewerClient.from("offers").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      candidate_id: TENANT_A.candidates.alice.id,
      job_id: TENANT_A.jobs.seniorEngineer.id,
      compensation: { base_salary: 100000, currency: "USD", period: "annual" },
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B CANNOT INSERT offers into Tenant A org", async () => {
    const { error } = await tenantBClient.from("offers").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.aliceForEngineer.id,
      candidate_id: TENANT_A.candidates.alice.id,
      job_id: TENANT_A.jobs.seniorEngineer.id,
      compensation: { base_salary: 100000, currency: "USD", period: "annual" },
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("recruiter can UPDATE offers in own org", async () => {
    const { data } = await recruiterClient
      .from("offers")
      .update({ terms: "Updated terms" })
      .eq("id", offerId)
      .select("id");
    expect(data).toHaveLength(1);
  });

  it("hiring_manager CANNOT UPDATE offers", async () => {
    const { data } = await hmClient
      .from("offers")
      .update({ terms: "Should not update" })
      .eq("id", offerId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  it("Tenant B CANNOT UPDATE Tenant A offers", async () => {
    const { data } = await tenantBClient
      .from("offers")
      .update({ terms: "Cross-tenant attack" })
      .eq("id", offerId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("owner CANNOT hard-delete offers (policy = FALSE)", async () => {
    const { data } = await ownerClient
      .from("offers")
      .delete()
      .eq("id", offerId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  it("Tenant B CANNOT hard-delete Tenant A offers", async () => {
    const { data } = await tenantBClient
      .from("offers")
      .delete()
      .eq("id", offerId)
      .select("id");
    expect(data).toHaveLength(0);
  });

  // ─── Restore modified offer ────────────────────────────────

  afterAll(async () => {
    await serviceClient
      .from("offers")
      .update({ terms: null })
      .eq("id", offerId);
  });
});
