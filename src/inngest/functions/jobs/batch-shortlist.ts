import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import {
  scoreResumeAgainstJob,
  buildShortlistReportSummary,
  isDataSufficient,
  type ResumeData,
} from "@/lib/ai/shortlist";

/**
 * D32 §17 — AI Batch Shortlist: Score all applicants for a job.
 * Triggered by jobs/shortlist.requested event.
 * Processes applications in batches, writes shortlist_candidates rows,
 * then generates executive summary.
 */
export const batchShortlist = inngest.createFunction(
  {
    id: "jobs/batch-shortlist",
    name: "AI Batch Shortlist: Score All Applicants for Job",
    concurrency: { limit: 3 },
    retries: 2,
  },
  { event: "jobs/shortlist.requested" },
  async ({ event, step }) => {
    const { jobId, reportId, orgId, triggeredBy } = event.data as {
      jobId: string;
      reportId: string;
      orgId: string;
      triggeredBy: string;
    };

    const supabase = createServiceClient();

    // Step 1: Mark report as processing
    await step.run("mark-processing", async () => {
      await supabase
        .from("ai_shortlist_reports")
        .update({ status: "processing" })
        .eq("id", reportId);
    });

    // Step 2: Fetch job details + required skills
    const jobData = await step.run("fetch-job", async () => {
      const { data: job } = await supabase
        .from("job_openings")
        .select("id, title, description")
        .eq("id", jobId)
        .single();

      const { data: skillRows } = await supabase
        .from("job_required_skills")
        .select("skills:skill_id (name), importance, is_mandatory")
        .eq("job_id", jobId)
        .is("deleted_at", null);

      const requiredSkills: string[] = [];
      const mandatorySkills: string[] = [];
      for (const row of skillRows ?? []) {
        const skill = (Array.isArray(row.skills) ? row.skills[0] : row.skills) as { name: string } | null;
        if (!skill?.name) continue;
        requiredSkills.push(skill.name);
        if (row.is_mandatory) mandatorySkills.push(skill.name);
      }

      return {
        title: job?.title ?? "Unknown",
        description: job?.description ?? "",
        requiredSkills,
        mandatorySkills,
      };
    });

    // Step 3: Fetch all active applications with candidate data
    const applications = await step.run("fetch-applications", async () => {
      const { data } = await supabase
        .from("applications")
        .select(`
          id, candidate_id,
          candidates!inner(id, full_name, resume_parsed, resume_parsed_at)
        `)
        .eq("job_opening_id", jobId)
        .eq("organization_id", orgId)
        .eq("status", "active")
        .is("deleted_at", null);

      return (data ?? []).map((app) => {
        const candidate = (Array.isArray(app.candidates) ? app.candidates[0] : app.candidates) as {
          id: string;
          full_name: string;
          resume_parsed: unknown;
          resume_parsed_at: string | null;
        } | null;

        return {
          applicationId: app.id,
          candidateId: app.candidate_id,
          candidateName: candidate?.full_name ?? "Unknown",
          resumeParsed: candidate?.resume_parsed as ResumeData | null,
          hasParsedResume: Boolean(candidate?.resume_parsed_at),
        };
      });
    });

    // Step 4: Check existing domain scores from ai_match_explanations
    const domainScores = await step.run("fetch-domain-scores", async () => {
      const appIds = applications.map((a) => a.applicationId);
      if (appIds.length === 0) return {};

      const { data } = await supabase
        .from("ai_match_explanations")
        .select("application_id, similarity_score")
        .in("application_id", appIds);

      const scores: Record<string, number> = {};
      for (const row of data ?? []) {
        if (row.application_id && row.similarity_score != null) {
          scores[row.application_id] = row.similarity_score;
        }
      }
      return scores;
    });

    // Step 5: Score each application (batches of 10)
    const BATCH_SIZE = 10;
    const allResults: Array<{
      applicationId: string;
      candidateId: string;
      candidateName: string;
      result: Awaited<ReturnType<typeof scoreResumeAgainstJob>> | null;
      isInsufficientData: boolean;
    }> = [];

    for (let i = 0; i < applications.length; i += BATCH_SIZE) {
      const batch = applications.slice(i, i + BATCH_SIZE);
      const batchResults = await step.run(`score-batch-${i}`, async () => {
        const results = [];
        for (const app of batch) {
          if (!isDataSufficient(app.resumeParsed)) {
            results.push({
              applicationId: app.applicationId,
              candidateId: app.candidateId,
              candidateName: app.candidateName,
              result: null,
              isInsufficientData: true,
            });
            continue;
          }

          const result = await scoreResumeAgainstJob({
            jobTitle: jobData.title,
            jobDescription: jobData.description,
            requiredSkills: jobData.requiredSkills,
            mandatorySkills: jobData.mandatorySkills,
            experienceMinYears: null,
            educationRequirement: null,
            parsedResume: app.resumeParsed!,
            existingDomainScore: domainScores[app.applicationId] ?? null,
            organizationId: orgId,
            userId: triggeredBy,
          });

          results.push({
            applicationId: app.applicationId,
            candidateId: app.candidateId,
            candidateName: app.candidateName,
            result,
            isInsufficientData: false,
          });
        }
        return results;
      });
      allResults.push(...batchResults);
    }

    // Step 6: Write shortlist_candidates rows
    const counts = await step.run("write-candidates", async () => {
      let shortlistCount = 0;
      let holdCount = 0;
      let rejectCount = 0;
      let insufficientDataCount = 0;

      const rows = allResults.map((r) => {
        const tier = r.isInsufficientData ? "insufficient_data" : (r.result?.tier ?? "insufficient_data");
        if (tier === "shortlist") shortlistCount++;
        else if (tier === "hold") holdCount++;
        else if (tier === "reject") rejectCount++;
        else insufficientDataCount++;

        return {
          organization_id: orgId,
          report_id: reportId,
          application_id: r.applicationId,
          candidate_id: r.candidateId,
          ai_tier: tier,
          composite_score: r.result?.compositeScore ?? null,
          skills_score: r.result?.skillsScore ?? null,
          experience_score: r.result?.experienceScore ?? null,
          education_score: r.result?.educationScore ?? null,
          domain_score: r.result?.domainScore ?? null,
          trajectory_score: r.result?.trajectoryScore ?? null,
          strengths: r.result?.strengths ?? [],
          gaps: r.result?.gaps ?? [],
          clarifying_question: r.result?.clarifyingQuestion ?? null,
          reject_reason: r.result?.rejectReason ?? null,
          eeoc_flags: r.result?.eeocFlags ?? [],
        };
      });

      if (rows.length > 0) {
        await supabase.from("ai_shortlist_candidates").upsert(rows, {
          onConflict: "report_id,application_id",
          ignoreDuplicates: false,
        });
      }

      return { shortlistCount, holdCount, rejectCount, insufficientDataCount };
    });

    // Step 7: Generate executive summary
    const summary = await step.run("generate-summary", async () => {
      const topCandidates = allResults
        .filter((r) => r.result?.tier === "shortlist")
        .sort((a, b) => (b.result?.compositeScore ?? 0) - (a.result?.compositeScore ?? 0))
        .slice(0, 5)
        .map((r) => ({
          name: r.candidateName,
          compositeScore: r.result!.compositeScore,
          topStrength: r.result!.strengths[0] ?? "Strong overall fit",
        }));

      const rejectionReasons = allResults
        .filter((r) => r.result?.tier === "reject" && r.result?.rejectReason)
        .map((r) => r.result!.rejectReason!)
        .slice(0, 5);

      const eeocFlagsPresent = allResults.some(
        (r) => r.result?.eeocFlags && r.result.eeocFlags.length > 0,
      );

      return buildShortlistReportSummary({
        jobTitle: jobData.title,
        totalApplications: applications.length,
        shortlistCount: counts.shortlistCount,
        holdCount: counts.holdCount,
        rejectCount: counts.rejectCount,
        topCandidates,
        commonRejectionReasons: rejectionReasons,
        eeocFlagsPresent,
        organizationId: orgId,
        userId: triggeredBy,
      });
    });

    // Step 8: Update report as complete
    await step.run("complete-report", async () => {
      await supabase
        .from("ai_shortlist_reports")
        .update({
          status: "complete",
          total_applications: applications.length,
          shortlist_count: counts.shortlistCount,
          hold_count: counts.holdCount,
          reject_count: counts.rejectCount,
          insufficient_data_count: counts.insufficientDataCount,
          executive_summary: summary.executiveSummary,
          hiring_manager_note: summary.hiringManagerNote,
          completed_at: new Date().toISOString(),
        })
        .eq("id", reportId);
    });

    // Step 9: Notify recruiter
    await step.run("notify-recruiter", async () => {
      await inngest.send({
        name: "ats/notification.dispatch",
        data: {
          organizationId: orgId,
          userId: triggeredBy,
          type: "shortlist_complete",
          title: `AI Shortlist for "${jobData.title}" is ready`,
          body: `${counts.shortlistCount} shortlisted, ${counts.holdCount} hold, ${counts.rejectCount} rejected out of ${applications.length} applicants.`,
          actionUrl: `/jobs/${jobId}/shortlist-report/${reportId}`,
        },
      });
    });

    return { reportId, total: applications.length, ...counts };
  },
);
