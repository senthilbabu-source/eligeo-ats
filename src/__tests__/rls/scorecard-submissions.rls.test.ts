/**
 * RLS Tests: scorecard_submissions
 * D24 §6.2 — blind review scorecard submissions
 *
 * Policies (migration 026):
 *   SELECT: is_org_member + deleted_at IS NULL + (submitted_by = self OR privileged role OR EXISTS own submission for same application)
 *   INSERT: organization_id = current_user_org_id() + is_org_member + submitted_by = auth.uid()
 *   UPDATE: (submitted_by = self OR owner/admin) + organization_id = current_user_org_id()
 *   DELETE: USING (FALSE) — hard deletes forbidden
 *
 * Critical: Blind review — interviewers cannot see others' submissions until they submit their own.
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's submissions.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: scorecard_submissions", () => {
  let ownerClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let hmClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  // Seed submission = Roshelle's screening feedback (seeded in seed.sql)
  const seedSubmissionId = TENANT_A.scorecardSubmissions.screeningFeedback.id;

  // Track IDs for cleanup
  const cleanupIds: string[] = [];

  // Interviewer's submission (created in test 7, used in test 10)
  let interviewerSubmissionId: string;

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
    // Clean up interviewer submission if created
    if (interviewerSubmissionId) {
      await serviceClient
        .from("scorecard_submissions")
        .delete()
        .eq("id", interviewerSubmissionId);
    }
    for (const id of cleanupIds) {
      await serviceClient
        .from("scorecard_submissions")
        .delete()
        .eq("id", id);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT all submissions in own org", async () => {
    const { data, error } = await ownerClient
      .from("scorecard_submissions")
      .select("id")
      .eq("id", seedSubmissionId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedSubmissionId);
  });

  it("admin can SELECT all submissions in own org", async () => {
    const { data, error } = await adminClient
      .from("scorecard_submissions")
      .select("id")
      .eq("id", seedSubmissionId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedSubmissionId);
  });

  it("recruiter can SELECT all submissions in own org (privileged role)", async () => {
    const { data, error } = await recruiterClient
      .from("scorecard_submissions")
      .select("id")
      .eq("id", seedSubmissionId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedSubmissionId);
  });

  it("hiring_manager can SELECT all submissions in own org (privileged role)", async () => {
    const { data, error } = await hmClient
      .from("scorecard_submissions")
      .select("id")
      .eq("id", seedSubmissionId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedSubmissionId);
  });

  it("interviewer CANNOT see Roshelle's submission BEFORE submitting their own (blind review)", async () => {
    // Taylor (interviewer) has NOT submitted a scorecard for Alice's application yet.
    // Roshelle's submission is for Alice's application. Taylor should NOT see it.
    const { data } = await interviewerClient
      .from("scorecard_submissions")
      .select("id")
      .eq("id", seedSubmissionId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("Tenant B cannot SELECT Tenant A submissions", async () => {
    const { data } = await tenantBClient
      .from("scorecard_submissions")
      .select("id")
      .eq("id", seedSubmissionId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("interviewer can INSERT own submission (submitted_by = self)", async () => {
    interviewerSubmissionId = crypto.randomUUID();
    const { error } = await interviewerClient
      .from("scorecard_submissions")
      .insert({
        id: interviewerSubmissionId,
        organization_id: TENANT_A.org.id,
        interview_id: TENANT_A.interviews.aliceTechnical.id,
        application_id: TENANT_A.applications.aliceForEngineer.id,
        submitted_by: TENANT_A.users.interviewer.id,
        overall_recommendation: "yes",
        overall_notes: "Solid technical skills demonstrated.",
      });
    expect(error).toBeNull();
  });

  it("interviewer cannot INSERT with mismatched submitted_by", async () => {
    const { error } = await interviewerClient
      .from("scorecard_submissions")
      .insert({
        id: crypto.randomUUID(),
        organization_id: TENANT_A.org.id,
        interview_id: TENANT_A.interviews.aliceTechnical.id,
        application_id: TENANT_A.applications.aliceForEngineer.id,
        submitted_by: TENANT_A.users.recruiter.id, // not the interviewer
        overall_recommendation: "no",
        overall_notes: "Spoofed submission",
      });
    expect(error).not.toBeNull();
  });

  it("Tenant B cannot INSERT into Tenant A submissions", async () => {
    const { error } = await tenantBClient
      .from("scorecard_submissions")
      .insert({
        id: crypto.randomUUID(),
        organization_id: TENANT_A.org.id,
        interview_id: TENANT_A.interviews.aliceScreening.id,
        application_id: TENANT_A.applications.aliceForEngineer.id,
        submitted_by: TENANT_B.users.owner.id,
        overall_recommendation: "strong_no",
        overall_notes: "Cross-tenant intrusion",
      });
    expect(error).not.toBeNull();
  });

  // ─── BLIND REVIEW REVEAL (after interviewer submitted in test 7) ────

  it("interviewer CAN now see Roshelle's submission after submitting their own (blind review reveal)", async () => {
    // Taylor has now submitted for Alice's application (test 7 above).
    // The blind review policy should now allow Taylor to see Roshelle's submission
    // for the same application.
    const { data, error } = await interviewerClient
      .from("scorecard_submissions")
      .select("id")
      .eq("id", seedSubmissionId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedSubmissionId);
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("submitter (recruiter) can UPDATE own submission", async () => {
    const { error } = await recruiterClient
      .from("scorecard_submissions")
      .update({ overall_notes: "Updated screening notes." })
      .eq("id", seedSubmissionId);
    expect(error).toBeNull();
  });

  it("owner can UPDATE any submission in own org", async () => {
    const { data, error } = await ownerClient
      .from("scorecard_submissions")
      .update({ overall_notes: "Owner reviewed." })
      .eq("id", seedSubmissionId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("admin can UPDATE any submission in own org", async () => {
    const { data, error } = await adminClient
      .from("scorecard_submissions")
      .update({ overall_notes: "Admin reviewed." })
      .eq("id", seedSubmissionId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("interviewer cannot UPDATE Roshelle's submission (not own, not owner/admin)", async () => {
    const { data } = await interviewerClient
      .from("scorecard_submissions")
      .update({ overall_notes: "Interviewer hijack" })
      .eq("id", seedSubmissionId)
      .select("id");
    // RLS silently filters — update affects 0 rows
    expect(data).toEqual([]);
  });

  it("Tenant B cannot UPDATE Tenant A submissions", async () => {
    const { data } = await tenantBClient
      .from("scorecard_submissions")
      .update({ overall_notes: "Cross-tenant edit" })
      .eq("id", seedSubmissionId)
      .select("id");
    expect(data).toEqual([]);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("owner cannot hard-delete submissions (policy FALSE)", async () => {
    const { data } = await ownerClient
      .from("scorecard_submissions")
      .delete()
      .eq("id", seedSubmissionId)
      .select("id");
    // DELETE policy is USING (FALSE) — affects 0 rows
    expect(data).toEqual([]);
  });

  it("Tenant B cannot DELETE Tenant A submissions", async () => {
    const { data } = await tenantBClient
      .from("scorecard_submissions")
      .delete()
      .eq("id", seedSubmissionId)
      .select("id");
    expect(data).toEqual([]);
  });
});
