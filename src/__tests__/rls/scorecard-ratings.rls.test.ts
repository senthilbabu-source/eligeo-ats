/**
 * RLS Tests: scorecard_ratings
 * D24 §6.2 — scorecard attribute ratings with inherited blind review
 *
 * Policies (migration 026):
 *   SELECT: is_org_member + deleted_at IS NULL + EXISTS(parent submission visible via blind review logic)
 *   INSERT: is_org_member + EXISTS(submission WHERE submitted_by = auth.uid())
 *   UPDATE: EXISTS(submission WHERE submitted_by = self OR owner/admin) + org check
 *   DELETE: USING (FALSE) — hard deletes forbidden
 *
 * Ratings inherit blind review from parent scorecard_submissions.
 * Cross-tenant: Tenant B cannot see or mutate Tenant A's ratings.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";
import { createTestClient, createServiceClient, clearClientCache } from "../helpers";

describe("RLS: scorecard_ratings", () => {
  let ownerClient: SupabaseClient;
  let recruiterClient: SupabaseClient;
  let interviewerClient: SupabaseClient;
  let tenantBClient: SupabaseClient;
  let serviceClient: SupabaseClient;

  // Seed ratings — Roshelle's 3 ratings on her screening feedback submission
  const seedRatingId = TENANT_A.scorecardRatings.systemDesignRating.id;
  const seedSubmissionId = TENANT_A.scorecardSubmissions.screeningFeedback.id;

  // Temporary interview + submission + rating for Bob's application (avoids poisoning Alice's blind review)
  let tempInterviewId: string;
  let interviewerSubmissionId: string;
  let interviewerRatingId: string;

  beforeAll(async () => {
    ownerClient = await createTestClient(TENANT_A.users.owner.email);
    recruiterClient = await createTestClient(TENANT_A.users.recruiter.email);
    interviewerClient = await createTestClient(TENANT_A.users.interviewer.email);
    tenantBClient = await createTestClient(TENANT_B.users.owner.email);
    serviceClient = createServiceClient();

    // Create a temp interview for Bob's application (separate from Alice's)
    tempInterviewId = crypto.randomUUID();
    const { error: intErr } = await serviceClient.from("interviews").insert({
      id: tempInterviewId,
      organization_id: TENANT_A.org.id,
      application_id: TENANT_A.applications.bobForEngineer.id,
      job_id: TENANT_A.jobs.seniorEngineer.id,
      interviewer_id: TENANT_A.users.interviewer.id,
      interview_type: "technical",
      status: "completed",
      created_by: TENANT_A.users.recruiter.id,
    });
    if (intErr) throw new Error(`Temp interview seed failed: ${intErr.message}`);
  });

  afterAll(async () => {
    // Clean up interviewer's rating and submission (rating first due to FK)
    if (interviewerRatingId) {
      await serviceClient
        .from("scorecard_ratings")
        .delete()
        .eq("id", interviewerRatingId);
    }
    if (interviewerSubmissionId) {
      await serviceClient
        .from("scorecard_submissions")
        .delete()
        .eq("id", interviewerSubmissionId);
    }
    if (tempInterviewId) {
      await serviceClient
        .from("interviews")
        .delete()
        .eq("id", tempInterviewId);
    }
    clearClientCache();
  });

  // ─── SELECT ────────────────────────────────────────────────

  it("owner can SELECT ratings in own org", async () => {
    const { data, error } = await ownerClient
      .from("scorecard_ratings")
      .select("id")
      .eq("id", seedRatingId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedRatingId);
  });

  it("recruiter can SELECT ratings in own org (privileged role)", async () => {
    const { data, error } = await recruiterClient
      .from("scorecard_ratings")
      .select("id")
      .eq("id", seedRatingId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(seedRatingId);
  });

  it("interviewer CANNOT see ratings before submitting own scorecard (blind review inherited)", async () => {
    // Taylor has NOT submitted a scorecard for Alice's application.
    // Roshelle's ratings should be invisible due to inherited blind review.
    const { data } = await interviewerClient
      .from("scorecard_ratings")
      .select("id")
      .eq("id", seedRatingId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("Tenant B cannot SELECT Tenant A ratings", async () => {
    const { data } = await tenantBClient
      .from("scorecard_ratings")
      .select("id")
      .eq("id", seedRatingId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── INSERT ────────────────────────────────────────────────

  it("submitter can INSERT rating for own submission", async () => {
    // First create an interviewer submission for Bob's application via serviceClient (bypasses RLS)
    // Uses Bob's application to avoid poisoning Alice's blind review in parallel test files
    interviewerSubmissionId = crypto.randomUUID();
    const { error: subErr } = await serviceClient
      .from("scorecard_submissions")
      .insert({
        id: interviewerSubmissionId,
        organization_id: TENANT_A.org.id,
        interview_id: tempInterviewId,
        application_id: TENANT_A.applications.bobForEngineer.id,
        submitted_by: TENANT_A.users.interviewer.id,
        overall_recommendation: "yes",
        overall_notes: "Good candidate overall.",
      });
    if (subErr) throw new Error(`Interviewer submission seed failed: ${subErr.message}`);

    // Now insert a rating via interviewerClient (through RLS)
    interviewerRatingId = crypto.randomUUID();
    const { error } = await interviewerClient
      .from("scorecard_ratings")
      .insert({
        id: interviewerRatingId,
        submission_id: interviewerSubmissionId,
        attribute_id: TENANT_A.scorecardAttributes.systemDesign.id,
        organization_id: TENANT_A.org.id,
        rating: 4,
        notes: "Demonstrated solid system design skills.",
      });
    expect(error).toBeNull();
  });

  it("interviewer cannot INSERT rating for someone else's submission", async () => {
    const { error } = await interviewerClient
      .from("scorecard_ratings")
      .insert({
        id: crypto.randomUUID(),
        submission_id: seedSubmissionId, // Roshelle's submission
        attribute_id: TENANT_A.scorecardAttributes.systemDesign.id,
        organization_id: TENANT_A.org.id,
        rating: 3,
        notes: "Attempted rating on someone else's submission",
      });
    expect(error).not.toBeNull();
  });

  it("Tenant B cannot INSERT into Tenant A ratings", async () => {
    const { error } = await tenantBClient
      .from("scorecard_ratings")
      .insert({
        id: crypto.randomUUID(),
        submission_id: seedSubmissionId,
        attribute_id: TENANT_A.scorecardAttributes.systemDesign.id,
        organization_id: TENANT_A.org.id,
        rating: 1,
        notes: "Cross-tenant intrusion",
      });
    expect(error).not.toBeNull();
  });

  // ─── UPDATE ────────────────────────────────────────────────

  it("submitter can UPDATE own rating", async () => {
    // Recruiter (Roshelle) updating her own rating on her own submission
    const { data, error } = await recruiterClient
      .from("scorecard_ratings")
      .update({ rating: 5, notes: "Revised upward after reflection." })
      .eq("id", seedRatingId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("Tenant B cannot UPDATE Tenant A ratings", async () => {
    const { data } = await tenantBClient
      .from("scorecard_ratings")
      .update({ rating: 1 })
      .eq("id", seedRatingId)
      .select("id");
    expect(data).toEqual([]);
  });

  // ─── DELETE ────────────────────────────────────────────────

  it("owner cannot hard-delete ratings (policy FALSE)", async () => {
    const { data } = await ownerClient
      .from("scorecard_ratings")
      .delete()
      .eq("id", seedRatingId)
      .select("id");
    // DELETE policy is USING (FALSE) — affects 0 rows
    expect(data).toEqual([]);
  });
});
