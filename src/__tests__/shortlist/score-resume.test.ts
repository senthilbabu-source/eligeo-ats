import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P6-5: scoreResumeAgainstJob + buildShortlistReportSummary AI function tests.
 * Mocks AI SDK + credit system. Verifies schema shapes and credit checks.
 */

// Mock AI SDK
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  smartModel: "gpt-4o",
  chatModel: "gpt-4o-mini",
  AI_MODELS: { fast: "gpt-4o-mini", smart: "gpt-4o", embedding: "text-embedding-3-small" },
}));

vi.mock("@/lib/ai/credits", () => ({
  consumeAiCredits: vi.fn(),
  logAiUsage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { generateObject } from "ai";
import { consumeAiCredits } from "@/lib/ai/credits";
import { scoreResumeAgainstJob, buildShortlistReportSummary } from "@/lib/ai/shortlist";

const MOCK_RESUME = {
  skills: ["Python", "React", "SQL", "Docker"],
  workExperience: [
    { title: "Software Engineer", company: "Acme Corp", startDate: "2020-01", endDate: "2024-01", description: "Built APIs" },
  ],
  education: [
    { degree: "BS", field: "Computer Science", institution: "MIT", year: 2019 },
  ],
  totalYearsExperience: 4,
};

describe("P6-5: scoreResumeAgainstJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return scores and tier on success", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        skillsScore: 0.8,
        experienceScore: 0.7,
        educationScore: 0.9,
        trajectoryScore: 0.6,
        strengths: ["Strong Python background"],
        gaps: ["No Kubernetes experience"],
        clarifyingQuestion: null,
        rejectReason: null,
        eeocFlags: [],
        mandatorySkillMissing: false,
      },
      usage: { inputTokens: 500, outputTokens: 200 },
    } as never);

    const result = await scoreResumeAgainstJob({
      jobTitle: "Senior Engineer",
      jobDescription: "Build APIs and services",
      requiredSkills: ["Python", "SQL"],
      mandatorySkills: ["Python"],
      experienceMinYears: 3,
      educationRequirement: "BS preferred",
      parsedResume: MOCK_RESUME,
      existingDomainScore: 0.75,
      organizationId: "org-1",
      userId: "user-1",
    });

    expect(result.skillsScore).toBe(0.8);
    expect(result.domainScore).toBe(0.75); // Uses existing domain score
    expect(result.compositeScore).toBeGreaterThan(0);
    expect(result.tier).toBeDefined();
    expect(["shortlist", "hold", "reject", "insufficient_data"]).toContain(result.tier);
    expect(result.strengths).toHaveLength(1);
  });

  it("should return insufficient_data when credits unavailable", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    const result = await scoreResumeAgainstJob({
      jobTitle: "Engineer",
      jobDescription: "Build things",
      requiredSkills: [],
      mandatorySkills: [],
      experienceMinYears: null,
      educationRequirement: null,
      parsedResume: MOCK_RESUME,
      existingDomainScore: null,
      organizationId: "org-1",
    });

    expect(result.tier).toBe("insufficient_data");
    expect(result.rejectReason).toBe("Insufficient AI credits");
  });

  it("should handle AI errors gracefully", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockRejectedValue(new Error("API timeout"));

    const result = await scoreResumeAgainstJob({
      jobTitle: "Engineer",
      jobDescription: "Build things",
      requiredSkills: [],
      mandatorySkills: [],
      experienceMinYears: null,
      educationRequirement: null,
      parsedResume: MOCK_RESUME,
      existingDomainScore: null,
      organizationId: "org-1",
    });

    expect(result.tier).toBe("insufficient_data");
    expect(result.rejectReason).toBe("API timeout");
  });
});

describe("P6-5: buildShortlistReportSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return executive summary and hiring manager note", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        executiveSummary: "Strong candidate pool with 5 shortlisted.",
        hiringManagerNote: "Recommend interviewing the top 3 candidates first.",
      },
      usage: { inputTokens: 300, outputTokens: 100 },
    } as never);

    const result = await buildShortlistReportSummary({
      jobTitle: "Engineer",
      totalApplications: 20,
      shortlistCount: 5,
      holdCount: 8,
      rejectCount: 7,
      topCandidates: [
        { name: "Alice", compositeScore: 0.85, topStrength: "5 years Python" },
      ],
      commonRejectionReasons: ["Missing required skill"],
      eeocFlagsPresent: false,
      organizationId: "org-1",
    });

    expect(result.executiveSummary).toBeTruthy();
    expect(result.hiringManagerNote).toBeTruthy();
  });

  it("should handle credit failure", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    const result = await buildShortlistReportSummary({
      jobTitle: "Engineer",
      totalApplications: 10,
      shortlistCount: 3,
      holdCount: 4,
      rejectCount: 3,
      topCandidates: [],
      commonRejectionReasons: [],
      eeocFlagsPresent: false,
      organizationId: "org-1",
    });

    expect(result.executiveSummary).toBeNull();
    expect(result.error).toBe("Insufficient AI credits");
  });
});
