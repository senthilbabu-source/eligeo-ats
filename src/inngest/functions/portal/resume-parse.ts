import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { extractAndParseResume } from "@/lib/ai/resume-extractor";
import logger from "@/lib/utils/logger";

/**
 * portal/resume-parse
 *
 * D32 §4.3 — Automatically parses uploaded resume files after application submission.
 * Trigger: `portal/application-submitted` or `ats/candidate.resume-uploaded`
 *
 * Steps:
 * 1. Load application + candidate + file record
 * 2. Download file from Supabase Storage
 * 3. Extract text (pdf-parse for PDF, mammoth for DOCX)
 * 4. Parse via GPT-4o structured output
 * 5. Store result in candidates.resume_parsed
 * 6. Upsert extracted skills into candidate_skills
 * 7. Mark candidates.resume_parsed_at = NOW()
 * 8. Fire ats/candidate.skills_updated → triggers embedding refresh
 *
 * Credit cost: 2 AI credits per parse.
 * Concurrency: 1 per candidate to prevent duplicate parses.
 */
export const portalResumeParse = inngest.createFunction(
  {
    id: "portal-resume-parse",
    retries: 3,
    concurrency: [
      { scope: "fn", key: "event.data.candidateId", limit: 1 },
    ],
  },
  [
    { event: "portal/application-submitted" },
    { event: "ats/candidate.resume-uploaded" },
  ],
  async ({ event, step }) => {
    const { candidateId, organizationId, fileId } = event.data;

    if (!candidateId || !organizationId) {
      logger.warn(event.data, "Missing candidateId or organizationId");
      return { skipped: true, reason: "missing_required_fields" };
    }

    const supabase = createServiceClient();

    // Step 1: Find the resume file
    const resumeFile = await step.run("load-resume-file", async () => {
      if (fileId) {
        const { data } = await supabase
          .from("files")
          .select("id, storage_path, mime_type, original_filename")
          .eq("id", fileId)
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .single();
        return data;
      }

      // Find most recent resume file for this candidate
      const { data } = await supabase
        .from("files")
        .select("id, storage_path, mime_type, original_filename")
        .eq("entity_type", "candidate")
        .eq("entity_id", candidateId)
        .eq("file_category", "resume")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      return data;
    });

    if (!resumeFile) {
      logger.info({ candidateId }, "No resume file found — skipping parse");
      return { skipped: true, reason: "no_resume_file" };
    }

    // Step 2+3: Download file and extract+parse in single step
    // Combined because Buffer doesn't survive Inngest step serialization
    const parseResult = await step.run("download-and-parse", async () => {
      const { data, error } = await supabase.storage
        .from("uploads")
        .download(resumeFile.storage_path);

      if (error || !data) {
        throw new Error(
          `Failed to download file: ${error?.message ?? "No data"}`,
        );
      }

      const arrayBuffer = await data.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      return extractAndParseResume({
        fileBuffer,
        mimeType: resumeFile.mime_type,
        organizationId,
        candidateId,
      });
    });

    // Step 4: Store results
    await step.run("store-parsed-data", async () => {
      const parsedData = parseResult.data
        ? { ...parseResult.data, parsed_at: new Date().toISOString() }
        : { error: parseResult.error, raw_text: parseResult.rawText?.slice(0, 5000) };

      await supabase
        .from("candidates")
        .update({
          resume_parsed: parsedData,
          resume_text: parseResult.rawText?.slice(0, 50000) ?? null,
          resume_parsed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidateId)
        .eq("organization_id", organizationId);
    });

    // Step 5: Upsert skills if extraction succeeded
    if (parseResult.data?.skills?.length) {
      await step.run("upsert-skills", async () => {
        const skills = parseResult.data!.skills;

        for (const skillName of skills) {
          const normalizedName = skillName.trim();
          if (!normalizedName) continue;

          // Upsert skill into global skills table
          const { data: skill } = await supabase
            .from("skills")
            .upsert(
              { name: normalizedName, organization_id: organizationId },
              { onConflict: "organization_id,name" },
            )
            .select("id")
            .single();

          if (!skill) continue;

          // Link to candidate (skip if already exists)
          await supabase
            .from("candidate_skills")
            .upsert(
              {
                organization_id: organizationId,
                candidate_id: candidateId,
                skill_id: skill.id,
                source: "resume_parsed",
              },
              { onConflict: "organization_id,candidate_id,skill_id" },
            );
        }
      });

      // Step 6: Fire skills_updated event → triggers embedding refresh (H2-1)
      await step.sendEvent("fire-skills-updated", {
        name: "ats/candidate.skills_updated",
        data: { candidateId, organizationId },
      });
    }

    logger.info(
      { candidateId, strategy: parseResult.strategy, skillCount: parseResult.data?.skills?.length ?? 0 },
      "Resume parsed successfully",
    );

    return {
      success: true,
      candidateId,
      strategy: parseResult.strategy,
      skillCount: parseResult.data?.skills?.length ?? 0,
      error: parseResult.error,
    };
  },
);
