/**
 * RLS Tests: notification_preferences
 * D24 §6.2 — Wave F notification cluster
 *
 * Policies (from D07 schema doc):
 *   SELECT: is_org_member(organization_id) AND deleted_at IS NULL AND (user_id = auth.uid() OR has_org_role(..., 'owner', 'admin'))
 *   INSERT: is_org_member(organization_id) AND organization_id = current_user_org_id() AND user_id = auth.uid()
 *   UPDATE: organization_id = current_user_org_id() AND user_id = auth.uid()
 *   DELETE: organization_id = current_user_org_id() AND user_id = auth.uid()
 *
 * Key constraint: users can only manage their OWN preferences.
 * Admin/owner can SEE everyone's preferences but cannot modify them.
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's preferences.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import {
  createTestClient,
  createServiceClient,
  clearClientCache,
} from "../helpers";

describe("RLS: notification_preferences", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  // Roshelle's seeded preference
  const recruiterPrefId = TENANT_A.notificationPreferences.recruiterAppNew.id;
  const tenantBPrefId = TENANT_B.notificationPreferences.ownerAppNew.id;
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
      await serviceClient
        .from("notification_preferences")
        .delete()
        .eq("id", id);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("recruiter can SELECT own preferences", async () => {
    const { data, error } = await recruiterClient
      .from("notification_preferences")
      .select("id, event_type")
      .eq("id", recruiterPrefId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(recruiterPrefId);
  });

  it("owner can SELECT other user's preferences (admin visibility)", async () => {
    const { data, error } = await ownerClient
      .from("notification_preferences")
      .select("id")
      .eq("id", recruiterPrefId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(recruiterPrefId);
  });

  it("admin can SELECT other user's preferences", async () => {
    const { data, error } = await adminClient
      .from("notification_preferences")
      .select("id")
      .eq("id", recruiterPrefId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(recruiterPrefId);
  });

  it("hiring_manager cannot SELECT other user's preferences", async () => {
    const { data } = await hmClient
      .from("notification_preferences")
      .select("id")
      .eq("id", recruiterPrefId)
      .maybeSingle();
    // HM is not admin/owner and not the pref owner → invisible
    expect(data).toBeNull();
  });

  it("Tenant B cannot SELECT Tenant A preferences", async () => {
    const { data } = await tenantBClient
      .from("notification_preferences")
      .select("id")
      .eq("id", recruiterPrefId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("Tenant A cannot SELECT Tenant B preferences", async () => {
    const { data } = await ownerClient
      .from("notification_preferences")
      .select("id")
      .eq("id", tenantBPrefId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("user can INSERT own preference", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await hmClient.from("notification_preferences").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      user_id: TENANT_A.users.hiringManager.id,
      event_type: "interview.scheduled",
      channel: "email",
    });
    expect(error).toBeNull();
    cleanupIds.push(tempId);
  });

  it("user cannot INSERT preference for another user", async () => {
    const { error } = await hmClient.from("notification_preferences").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      user_id: TENANT_A.users.recruiter.id, // not self
      event_type: "offer.approved",
      channel: "none",
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B cannot INSERT into Tenant A org", async () => {
    const { error } = await tenantBClient
      .from("notification_preferences")
      .insert({
        id: crypto.randomUUID(),
        organization_id: TENANT_A.org.id,
        user_id: TENANT_B.users.owner.id,
        event_type: "application.new",
        channel: "both",
      });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("recruiter can UPDATE own preference", async () => {
    const { data, error } = await recruiterClient
      .from("notification_preferences")
      .update({ channel: "in_app" })
      .eq("id", recruiterPrefId)
      .select("id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);

    // Restore original
    await serviceClient
      .from("notification_preferences")
      .update({ channel: "both" })
      .eq("id", recruiterPrefId);
  });

  it("owner cannot UPDATE another user's preference", async () => {
    const { data } = await ownerClient
      .from("notification_preferences")
      .update({ channel: "none" })
      .eq("id", recruiterPrefId)
      .select("id");
    // Owner can SEE but cannot UPDATE (user_id != auth.uid())
    expect(data).toEqual([]);
  });

  it("Tenant B cannot UPDATE Tenant A preferences", async () => {
    const { data } = await tenantBClient
      .from("notification_preferences")
      .update({ channel: "none" })
      .eq("id", recruiterPrefId)
      .select("id");
    expect(data).toEqual([]);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("user can DELETE own preference", async () => {
    // Insert a disposable preference first
    const disposableId = crypto.randomUUID();
    await serviceClient.from("notification_preferences").insert({
      id: disposableId,
      organization_id: TENANT_A.org.id,
      user_id: TENANT_A.users.interviewer.id,
      event_type: "mention",
      channel: "none",
    });

    const { data, error } = await interviewerClient
      .from("notification_preferences")
      .delete()
      .eq("id", disposableId)
      .select("id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("owner cannot DELETE another user's preference", async () => {
    const { data } = await ownerClient
      .from("notification_preferences")
      .delete()
      .eq("id", recruiterPrefId)
      .select("id");
    expect(data).toEqual([]);
  });

  it("Tenant B cannot DELETE Tenant A preferences", async () => {
    const { data } = await tenantBClient
      .from("notification_preferences")
      .delete()
      .eq("id", recruiterPrefId)
      .select("id");
    expect(data).toEqual([]);
  });
});
