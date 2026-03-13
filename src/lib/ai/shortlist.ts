import { generateObject } from "ai";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { smartModel, chatModel, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";

// ── Types ─────────────────────────────────────────────────

export interface ResumeData {
  skills: string[];
  workExperience: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate: string | null;
    description: string;
  }>;
  education: Array<{
    degree: string;
    field: string;
    institution: string;
    year: number | null;
  }>;
  totalYearsExperience: number | null;
}

export interface ShortlistScoreResult {
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  domainScore: number;
  trajectoryScore: number;
  compositeScore: number;
  tier: "shortlist" | "hold" | "reject" | "insufficient_data";
  strengths: string[];
  gaps: string[];
  clarifyingQuestion: string | null;
  rejectReason: string | null;
  eeocFlags: string[];
  mandatorySkillMissing: boolean;
}

// ── Weights (D32 §17) ────────────────────────────────────

export const DIMENSION_WEIGHTS = {
  skills: 0.35,
  experience: 0.25,
  education: 0.15,
  domain: 0.15,
  trajectory: 0.10,
} as const;

// ── Pure Functions (testable without AI) ──────────────────

/**
 * Compute weighted composite score from 5 dimensions.
 * Each dimension is 0.0–1.0. Returns 0.0–1.0.
 */
export function computeCompositeScore(scores: {
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  domainScore: number;
  trajectoryScore: number;
}): number {
  return (
    scores.skillsScore * DIMENSION_WEIGHTS.skills +
    scores.experienceScore * DIMENSION_WEIGHTS.experience +
    scores.educationScore * DIMENSION_WEIGHTS.education +
    scores.domainScore * DIMENSION_WEIGHTS.domain +
    scores.trajectoryScore * DIMENSION_WEIGHTS.trajectory
  );
}

/**
 * Classify a candidate into a tier based on composite score and dimension scores.
 *
 * Rules (D32 §17 / Spec §5):
 * - SHORTLIST: composite >= 0.72 AND skills >= 0.60
 * - HOLD: composite >= 0.45 AND (composite < 0.72 OR skills < 0.60)
 * - REJECT: composite < 0.45 OR mandatory skill missing
 * - INSUFFICIENT_DATA: when data is missing
 */
export function classifyTier(params: {
  compositeScore: number;
  skillsScore: number;
  mandatorySkillMissing: boolean;
}): "shortlist" | "hold" | "reject" | "insufficient_data" {
  const { compositeScore, skillsScore, mandatorySkillMissing } = params;

  if (mandatorySkillMissing) return "reject";
  if (compositeScore < 0.45) return "reject";
  if (compositeScore >= 0.72 && skillsScore >= 0.60) return "shortlist";
  return "hold";
}

/**
 * Check if resume data is sufficient for scoring.
 * Requires parsed resume with at least 3 skills extracted.
 */
export function isDataSufficient(parsedResume: ResumeData | null): boolean {
  if (!parsedResume) return false;
  if (parsedResume.skills.length < 3) return false;
  return true;
}

// ── AI Scoring Function ───────────────────────────────────

const shortlistScoreSchema = z.object({
  skillsScore: z.number().min(0).max(1),
  experienceScore: z.number().min(0).max(1),
  educationScore: z.number().min(0).max(1),
  trajectoryScore: z.number().min(0).max(1),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  clarifyingQuestion: z.string().nullable(),
  rejectReason: z.string().nullable(),
  eeocFlags: z.array(z.string()),
  mandatorySkillMissing: z.boolean(),
});

const SHORTLIST_SYSTEM_PROMPT = `You are an expert recruitment analyst scoring a candidate's resume against a job opening.

Rules:
- Score each dimension from 0.0 to 1.0 based ONLY on evidence in the resume.
- Never infer skills not explicitly mentioned.
- Employment gaps must be flagged as EEOC-sensitive — recommend Hold, NEVER auto-reject on gaps alone.
- Provide specific text evidence for scores (e.g., "Python mentioned in 3 roles over 5 years").
- Be conservative: score what is there, not what might be there.

Dimensions:
1. Skills Coverage (0–1): (required skills present) / (total required). Boost +0.1 if 3+ preferred skills. Score 0 if mandatory skill missing.
2. Experience Match (0–1): Meets minimum years = 1.0, within 1 year under = 0.6, 2+ under = 0.2, overqualified by >5 years = 0.7.
3. Education Match (0–1): No requirement = 1.0, preferred + has degree = 1.0, preferred + no degree = 0.7, required + has = 1.0, required + no = 0.2. Field relevance ±0.15.
4. Trajectory (0–1): Positive = increasing seniority, tenure >18mo. Neutral = lateral moves. Negative = unexplained gaps >12mo (flag as EEOC).

EEOC compliance:
- Employment gaps MUST NOT be auto-disqualifying.
- Flag gaps as "clarification recommended" not "disqualifier".
- Protected characteristics (parental leave, medical, military) may explain gaps.`;

/**
 * D32 §17 — Score a candidate's parsed resume against a job opening.
 * Uses GPT-4o for accuracy-critical scoring. Credit cost: 3 (shortlist_score).
 */
export async function scoreResumeAgainstJob(params: {
  jobTitle: string;
  jobDescription: string;
  requiredSkills: string[];
  mandatorySkills: string[];
  experienceMinYears: number | null;
  educationRequirement: string | null;
  parsedResume: ResumeData;
  existingDomainScore: number | null;
  organizationId: string;
  userId?: string;
}): Promise<ShortlistScoreResult> {
  const {
    jobTitle,
    jobDescription,
    requiredSkills,
    mandatorySkills,
    experienceMinYears,
    educationRequirement,
    parsedResume,
    existingDomainScore,
    organizationId,
    userId,
  } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "shortlist_score");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "shortlist_score",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return {
      skillsScore: 0, experienceScore: 0, educationScore: 0,
      domainScore: 0, trajectoryScore: 0, compositeScore: 0,
      tier: "insufficient_data",
      strengths: [], gaps: [], clarifyingQuestion: null,
      rejectReason: "Insufficient AI credits", eeocFlags: [],
      mandatorySkillMissing: false,
    };
  }

  const workHistory = parsedResume.workExperience
    .map((w) => `${w.title} at ${w.company} (${w.startDate}–${w.endDate ?? "present"}): ${w.description}`)
    .join("\n");

  const educationHistory = parsedResume.education
    .map((e) => `${e.degree} in ${e.field} from ${e.institution}${e.year ? ` (${e.year})` : ""}`)
    .join("\n");

  const prompt = [
    `## Job: ${jobTitle}`,
    `Description: ${jobDescription.slice(0, 2000)}`,
    `Required skills: ${requiredSkills.join(", ") || "None specified"}`,
    `Mandatory skills (auto-reject if missing): ${mandatorySkills.join(", ") || "None"}`,
    experienceMinYears !== null ? `Minimum experience: ${experienceMinYears} years` : null,
    educationRequirement ? `Education requirement: ${educationRequirement}` : null,
    "",
    "## Candidate Resume",
    `Skills: ${parsedResume.skills.join(", ")}`,
    `Total years experience: ${parsedResume.totalYearsExperience ?? "Unknown"}`,
    "",
    "Work Experience:",
    workHistory || "None listed",
    "",
    "Education:",
    educationHistory || "None listed",
  ].filter(Boolean).join("\n");

  try {
    const { object, usage } = await generateObject({
      model: smartModel,
      schema: shortlistScoreSchema,
      system: SHORTLIST_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 800,
    });

    const domainScore = existingDomainScore ?? object.skillsScore;
    const compositeScore = computeCompositeScore({
      skillsScore: object.skillsScore,
      experienceScore: object.experienceScore,
      educationScore: object.educationScore,
      domainScore,
      trajectoryScore: object.trajectoryScore,
    });
    const tier = classifyTier({
      compositeScore,
      skillsScore: object.skillsScore,
      mandatorySkillMissing: object.mandatorySkillMissing,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "shortlist_score",
      entityType: "application",
      model: AI_MODELS.smart,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return {
      skillsScore: object.skillsScore,
      experienceScore: object.experienceScore,
      educationScore: object.educationScore,
      domainScore,
      trajectoryScore: object.trajectoryScore,
      compositeScore,
      tier,
      strengths: object.strengths,
      gaps: object.gaps,
      clarifyingQuestion: tier === "hold" ? object.clarifyingQuestion : null,
      rejectReason: tier === "reject" ? object.rejectReason : null,
      eeocFlags: object.eeocFlags,
      mandatorySkillMissing: object.mandatorySkillMissing,
    };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "shortlist_score",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return {
      skillsScore: 0, experienceScore: 0, educationScore: 0,
      domainScore: 0, trajectoryScore: 0, compositeScore: 0,
      tier: "insufficient_data",
      strengths: [], gaps: [], clarifyingQuestion: null,
      rejectReason: message, eeocFlags: [],
      mandatorySkillMissing: false,
    };
  }
}

// ── Report Summary ────────────────────────────────────────

const reportSummarySchema = z.object({
  executiveSummary: z.string(),
  hiringManagerNote: z.string(),
});

/**
 * Generate executive summary for a shortlist report.
 * Uses gpt-4o-mini (summary task). Credit cost: 1 (shortlist_summary).
 */
export async function buildShortlistReportSummary(params: {
  jobTitle: string;
  totalApplications: number;
  shortlistCount: number;
  holdCount: number;
  rejectCount: number;
  topCandidates: Array<{ name: string; compositeScore: number; topStrength: string }>;
  commonRejectionReasons: string[];
  eeocFlagsPresent: boolean;
  organizationId: string;
  userId?: string;
}): Promise<{
  executiveSummary: string | null;
  hiringManagerNote: string | null;
  error?: string;
}> {
  const { organizationId, userId, ...data } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "shortlist_summary");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "shortlist_summary",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { executiveSummary: null, hiringManagerNote: null, error: "Insufficient AI credits" };
  }

  const prompt = [
    `Job: ${data.jobTitle}`,
    `Total applications: ${data.totalApplications}`,
    `Shortlisted: ${data.shortlistCount}, Hold: ${data.holdCount}, Rejected: ${data.rejectCount}`,
    "",
    "Top candidates:",
    ...data.topCandidates.map(
      (c) => `  ${c.name} (${Math.round(c.compositeScore * 100)}%) — ${c.topStrength}`,
    ),
    "",
    data.commonRejectionReasons.length > 0
      ? `Common rejection reasons: ${data.commonRejectionReasons.join(", ")}`
      : "No common rejection patterns.",
    data.eeocFlagsPresent
      ? "EEOC flags present — mention in hiring manager note."
      : "",
  ].filter(Boolean).join("\n");

  try {
    const { object, usage } = await generateObject({
      model: chatModel,
      schema: reportSummarySchema,
      system:
        "You are a talent acquisition analyst. Write a concise executive summary (2-3 sentences) and a one-sentence hiring manager recommendation. " +
        "Be factual. If EEOC flags are present, note that human review is recommended for flagged candidates.",
      prompt,
      maxOutputTokens: 300,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "shortlist_summary",
      entityType: "job_opening",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return {
      executiveSummary: object.executiveSummary,
      hiringManagerNote: object.hiringManagerNote,
    };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "shortlist_summary",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { executiveSummary: null, hiringManagerNote: null, error: message };
  }
}
