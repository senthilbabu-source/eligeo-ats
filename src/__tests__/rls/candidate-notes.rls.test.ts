/**
 * RLS Tests: candidate_notes
 * D24 §6.2 — recruiter notes on candidate profiles
 *
 * Policies (migration 025):
 *   SELECT: is_org_member(organization_id) — all roles, own org only
 *   INSERT: is_org_member + created_by = auth.uid() (self-insert only)
 *   UPDATE: is_org_member + created_by = auth.uid() (author only)
 *   DELETE: author OR owner/admin
 *
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's notes.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: candidate_notes", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  // Seed note — created by the recruiter on Alice (TENANT_A)
  let seedNoteId: string;
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

    seedNoteId = crypto.randomUUID();
    const { error: seedErr } = await serviceClient.from("candidate_notes").insert({
      id: seedNoteId,
      organization_id: TENANT_A.org.id,
      candidate_id: TENANT_A.candidates.alice.id,
      content: "Strong technical background. Recommended for next round.",
      created_by: TENANT_A.users.recruiter.id,
    });
    if (seedErr) throw new Error(`TENANT_A note seed failed: ${seedErr.message}`);
    cleanupIds.push(seedNoteId);
  });

  afterAll(async () => {
    for (const id of cleanupIds) {
      await serviceClient.from("candidate_notes").delete().eq("id", id);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT notes in own org", async () => {
    const { data, error } = await ownerClient
      .from("candidate_notes")
      .select("id")
      .eq("id", seedNoteId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedNoteId);
  });

  it("admin can SELECT notes in own org", async () => {
    const { data, error } = await adminClient
      .from("candidate_notes")
      .select("id")
      .eq("id", seedNoteId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedNoteId);
  });

  it("recruiter can SELECT notes in own org", async () => {
    const { data, error } = await recruiterClient
      .from("candidate_notes")
      .select("id")
      .eq("id", seedNoteId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedNoteId);
  });

  it("hiring_manager can SELECT notes in own org", async () => {
    const { data, error } = await hmClient
      .from("candidate_notes")
      .select("id")
      .eq("id", seedNoteId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedNoteId);
  });

  it("interviewer can SELECT notes in own org", async () => {
    const { data, error } = await interviewerClient
      .from("candidate_notes")
      .select("id")
      .eq("id", seedNoteId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedNoteId);
  });

  it("Tenant B cannot SELECT Tenant A notes", async () => {
    const { data } = await tenantBClient
      .from("candidate_notes")
      .select("id")
      .eq("id", seedNoteId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("recruiter can INSERT own note", async () => {
    const tempId = crypto.randomUUID();
    const { error } = await recruiterClient.from("candidate_notes").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      candidate_id: TENANT_A.candidates.alice.id,
      content: "Followed up on references",
      created_by: TENANT_A.users.recruiter.id,
    });
    expect(error).toBeNull();
    cleanupIds.push(tempId);
  });

  it("recruiter cannot INSERT note with mismatched created_by", async () => {
    const { error } = await recruiterClient.from("candidate_notes").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      candidate_id: TENANT_A.candidates.alice.id,
      content: "Spoofed author",
      created_by: TENANT_A.users.admin.id, // not the recruiter
    });
    expect(error).not.toBeNull();
  });

  it("Tenant B cannot INSERT into Tenant A notes", async () => {
    const { error } = await tenantBClient.from("candidate_notes").insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      candidate_id: TENANT_A.candidates.alice.id,
      content: "Cross-tenant intrusion",
      created_by: TENANT_B.users.owner.id,
    });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("author (recruiter) can UPDATE own note", async () => {
    const { error } = await recruiterClient
      .from("candidate_notes")
      .update({ content: "Updated note content" })
      .eq("id", seedNoteId);
    expect(error).toBeNull();
  });

  it("admin cannot UPDATE another user's note", async () => {
    const { data } = await adminClient
      .from("candidate_notes")
      .update({ content: "Admin hijack" })
      .eq("id", seedNoteId)
      .select("id");
    // RLS silently filters — update affects 0 rows
    expect(data).toEqual([]);
  });

  it("Tenant B cannot UPDATE Tenant A notes", async () => {
    const { data } = await tenantBClient
      .from("candidate_notes")
      .update({ content: "Cross-tenant edit" })
      .eq("id", seedNoteId)
      .select("id");
    expect(data).toEqual([]);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("owner can DELETE any note in own org", async () => {
    // Create a temp note by recruiter, then delete it as owner
    const tempId = crypto.randomUUID();
    await serviceClient.from("candidate_notes").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      candidate_id: TENANT_A.candidates.alice.id,
      content: "To be deleted by owner",
      created_by: TENANT_A.users.recruiter.id,
    });

    const { error } = await ownerClient
      .from("candidate_notes")
      .delete()
      .eq("id", tempId);
    expect(error).toBeNull();
  });

  it("admin can DELETE any note in own org", async () => {
    const tempId = crypto.randomUUID();
    await serviceClient.from("candidate_notes").insert({
      id: tempId,
      organization_id: TENANT_A.org.id,
      candidate_id: TENANT_A.candidates.alice.id,
      content: "To be deleted by admin",
      created_by: TENANT_A.users.recruiter.id,
    });

    const { error } = await adminClient
      .from("candidate_notes")
      .delete()
      .eq("id", tempId);
    expect(error).toBeNull();
  });

  it("interviewer cannot DELETE another user's note", async () => {
    const { data } = await interviewerClient
      .from("candidate_notes")
      .delete()
      .eq("id", seedNoteId)
      .select("id");
    // RLS silently filters — delete affects 0 rows
    expect(data).toEqual([]);
  });

  it("Tenant B cannot DELETE Tenant A notes", async () => {
    const { data } = await tenantBClient
      .from("candidate_notes")
      .delete()
      .eq("id", seedNoteId)
      .select("id");
    expect(data).toEqual([]);
  });
});
