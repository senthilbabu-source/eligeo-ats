/**
 * RLS Tests: talent_pool_members
 * D24 §6.2 — custom test (junction table with composite unique constraint)
 *
 * talent_pool_members (migration 012):
 *   SELECT: is_org_member — all roles
 *   INSERT: owner, admin, recruiter
 *   UPDATE: owner, admin, recruiter
 *   DELETE: owner, admin, recruiter
 *
 * Cannot use generic generator because (talent_pool_id, candidate_id)
 * unique constraint causes collisions when multiple roles INSERT/DELETE
 * the same pair in parallel.
 */

import { describe, it, expect } from "vitest";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import {
  createTestClient,
  assertTenantIsolation,
  createServiceClient,
} from "../helpers";

const TABLE = "talent_pool_members";
const TENANT_A_RECORD_ID = "11111111-6009-4000-a000-000000000001";

// Each role gets its own candidate to avoid unique constraint collisions
// alice = ...-001 (not in pool), bob = ...-002 (not in pool), carol = ...-003 (seeded in pool)
const ROLE_CANDIDATES: Record<string, string> = {
  owner: TENANT_A.candidates.alice.id,     // alice
  admin: TENANT_A.candidates.bob.id,       // bob
  recruiter: TENANT_A.candidates.carol.id, // carol — but she's already seeded, so we use a second pool
};

const POOL_ID = "11111111-6005-4000-a000-000000000001";

describe(`RLS: ${TABLE}`, () => {
  // ── SELECT tests ──────────────────────────────────────

  it.each([
    ["owner", TENANT_A.users.owner.email],
    ["admin", TENANT_A.users.admin.email],
    ["recruiter", TENANT_A.users.recruiter.email],
    ["hiring_manager", TENANT_A.users.hiringManager.email],
    ["interviewer", TENANT_A.users.interviewer.email],
  ])("%s can SELECT from talent_pool_members", async (role, email) => {
    const client = await createTestClient(email);
    const { data, error } = await client
      .from(TABLE)
      .select("id")
      .eq("id", TENANT_A_RECORD_ID);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  // ── Tenant isolation ────────────────────────────────

  it("tenant B cannot see tenant A records", async () => {
    const client = await createTestClient(TENANT_B.users.owner.email);
    await assertTenantIsolation(client, TABLE, TENANT_A_RECORD_ID);
  });

  // ── INSERT tests (each role gets a unique candidate) ──

  it("owner can INSERT into talent_pool_members", async () => {
    const svc = createServiceClient();
    // Pre-cleanup: remove any stale alice record from prior failed runs
    await svc.from(TABLE).delete()
      .eq("talent_pool_id", POOL_ID)
      .eq("candidate_id", TENANT_A.candidates.alice.id);

    const client = await createTestClient(TENANT_A.users.owner.email);
    const recordId = crypto.randomUUID();
    const { error } = await client.from(TABLE).insert({
      id: recordId,
      organization_id: TENANT_A.org.id,
      talent_pool_id: POOL_ID,
      candidate_id: TENANT_A.candidates.alice.id,
      added_by: TENANT_A.users.owner.id,
      notes: "RLS test - owner insert",
    });
    expect(error).toBeNull();
    await svc.from(TABLE).delete().eq("id", recordId);
  });

  it("admin can INSERT into talent_pool_members", async () => {
    const svc = createServiceClient();
    // Pre-cleanup: remove any stale bob record from prior failed runs
    await svc.from(TABLE).delete()
      .eq("talent_pool_id", POOL_ID)
      .eq("candidate_id", TENANT_A.candidates.bob.id);

    const client = await createTestClient(TENANT_A.users.admin.email);
    const recordId = crypto.randomUUID();
    const { error } = await client.from(TABLE).insert({
      id: recordId,
      organization_id: TENANT_A.org.id,
      talent_pool_id: POOL_ID,
      candidate_id: TENANT_A.candidates.bob.id,
      added_by: TENANT_A.users.admin.id,
      notes: "RLS test - admin insert",
    });
    expect(error).toBeNull();
    await svc.from(TABLE).delete().eq("id", recordId);
  });

  it("recruiter can INSERT into talent_pool_members", async () => {
    const svc = createServiceClient();
    // Pre-cleanup: owner test used alice and cleaned up, but be safe
    await svc.from(TABLE).delete()
      .eq("talent_pool_id", POOL_ID)
      .eq("candidate_id", TENANT_A.candidates.alice.id);

    const client = await createTestClient(TENANT_A.users.recruiter.email);
    const recordId = crypto.randomUUID();
    const { error } = await client.from(TABLE).insert({
      id: recordId,
      organization_id: TENANT_A.org.id,
      talent_pool_id: POOL_ID,
      candidate_id: TENANT_A.candidates.alice.id,
      added_by: TENANT_A.users.recruiter.id,
      notes: "RLS test - recruiter insert",
    });
    expect(error).toBeNull();
    await svc.from(TABLE).delete().eq("id", recordId);
  });

  // ── INSERT denied tests ───────────────────────────────

  it("hiring_manager cannot INSERT into talent_pool_members", async () => {
    const client = await createTestClient(TENANT_A.users.hiringManager.email);
    const { error } = await client.from(TABLE).insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      talent_pool_id: POOL_ID,
      candidate_id: TENANT_A.candidates.alice.id,
      added_by: TENANT_A.users.hiringManager.id,
      notes: "RLS test - should fail",
    });
    expect(error).not.toBeNull();
  });

  it("interviewer cannot INSERT into talent_pool_members", async () => {
    const client = await createTestClient(TENANT_A.users.interviewer.email);
    const { error } = await client.from(TABLE).insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      talent_pool_id: POOL_ID,
      candidate_id: TENANT_A.candidates.bob.id,
      added_by: TENANT_A.users.interviewer.id,
      notes: "RLS test - should fail",
    });
    expect(error).not.toBeNull();
  });

  // ── UPDATE tests ────────────────────────────────────

  it.each([
    ["owner", TENANT_A.users.owner.email],
    ["admin", TENANT_A.users.admin.email],
    ["recruiter", TENANT_A.users.recruiter.email],
  ])("%s can UPDATE talent_pool_members", async (_role, email) => {
    const client = await createTestClient(email);
    const { error } = await client
      .from(TABLE)
      .update({ notes: `Updated by ${_role} RLS test` })
      .eq("id", TENANT_A_RECORD_ID);
    expect(error).toBeNull();
  });

  it.each([
    ["hiring_manager", TENANT_A.users.hiringManager.email],
    ["interviewer", TENANT_A.users.interviewer.email],
  ])("%s cannot UPDATE talent_pool_members", async (_role, email) => {
    const client = await createTestClient(email);
    const { data } = await client
      .from(TABLE)
      .update({ notes: "Should not work" })
      .eq("id", TENANT_A_RECORD_ID)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  // ── DELETE tests (each role gets own disposable record) ──

  it("owner can DELETE from talent_pool_members", async () => {
    const svc = createServiceClient();
    // Pre-cleanup
    await svc.from(TABLE).delete()
      .eq("talent_pool_id", POOL_ID)
      .eq("candidate_id", TENANT_A.candidates.alice.id);
    const recordId = crypto.randomUUID();
    await svc.from(TABLE).insert({
      id: recordId,
      organization_id: TENANT_A.org.id,
      talent_pool_id: POOL_ID,
      candidate_id: TENANT_A.candidates.alice.id,
      added_by: TENANT_A.users.owner.id,
      notes: "Disposable - owner delete test",
    });
    const client = await createTestClient(TENANT_A.users.owner.email);
    const { data, error } = await client
      .from(TABLE)
      .delete()
      .eq("id", recordId)
      .select("id");
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("admin can DELETE from talent_pool_members", async () => {
    const svc = createServiceClient();
    // Pre-cleanup: remove any stale bob record
    await svc.from(TABLE).delete()
      .eq("talent_pool_id", POOL_ID)
      .eq("candidate_id", TENANT_A.candidates.bob.id);
    const recordId = crypto.randomUUID();
    await svc.from(TABLE).insert({
      id: recordId,
      organization_id: TENANT_A.org.id,
      talent_pool_id: POOL_ID,
      candidate_id: TENANT_A.candidates.bob.id,
      added_by: TENANT_A.users.admin.id,
      notes: "Disposable - admin delete test",
    });
    const client = await createTestClient(TENANT_A.users.admin.email);
    const { data, error } = await client
      .from(TABLE)
      .delete()
      .eq("id", recordId)
      .select("id");
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("recruiter can DELETE from talent_pool_members", async () => {
    const svc = createServiceClient();
    // Pre-cleanup
    await svc.from(TABLE).delete()
      .eq("talent_pool_id", POOL_ID)
      .eq("candidate_id", TENANT_A.candidates.alice.id);
    const recordId = crypto.randomUUID();
    await svc.from(TABLE).insert({
      id: recordId,
      organization_id: TENANT_A.org.id,
      talent_pool_id: POOL_ID,
      candidate_id: TENANT_A.candidates.alice.id,
      added_by: TENANT_A.users.recruiter.id,
      notes: "Disposable - recruiter delete test",
    });
    const client = await createTestClient(TENANT_A.users.recruiter.email);
    const { data, error } = await client
      .from(TABLE)
      .delete()
      .eq("id", recordId)
      .select("id");
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  // ── DELETE denied tests ───────────────────────────────

  it.each([
    ["hiring_manager", TENANT_A.users.hiringManager.email],
    ["interviewer", TENANT_A.users.interviewer.email],
  ])("%s cannot DELETE from talent_pool_members", async (_role, email) => {
    const client = await createTestClient(email);
    const { data } = await client
      .from(TABLE)
      .delete()
      .eq("id", TENANT_A_RECORD_ID)
      .select("id");
    expect(!data || data.length === 0).toBe(true);
  });

  // ── Tenant B isolation on INSERT ─────────────────────

  it("tenant B cannot INSERT into tenant A talent_pool_members", async () => {
    const client = await createTestClient(TENANT_B.users.owner.email);
    const { error } = await client.from(TABLE).insert({
      id: crypto.randomUUID(),
      organization_id: TENANT_A.org.id,
      talent_pool_id: POOL_ID,
      candidate_id: TENANT_A.candidates.alice.id,
      added_by: TENANT_B.users.owner.id,
      notes: "Cross-tenant - should fail",
    });
    expect(error).not.toBeNull();
  });
});
