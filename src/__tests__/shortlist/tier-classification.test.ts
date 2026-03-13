import { describe, it, expect } from "vitest";
import {
  classifyTier,
  computeCompositeScore,
  isDataSufficient,
  DIMENSION_WEIGHTS,
} from "@/lib/ai/shortlist";

/**
 * P6-5: Tier Classification Tests
 * D32 §17 — Shortlist / Hold / Reject / Insufficient Data rules.
 */

describe("P6-5: classifyTier", () => {
  it("should classify as shortlist when composite >= 0.72 and skills >= 0.60", () => {
    const tier = classifyTier({
      compositeScore: 0.75,
      skillsScore: 0.65,
      mandatorySkillMissing: false,
    });
    expect(tier).toBe("shortlist");
  });

  it("should classify as hold when composite >= 0.45 but < 0.72", () => {
    const tier = classifyTier({
      compositeScore: 0.55,
      skillsScore: 0.70,
      mandatorySkillMissing: false,
    });
    expect(tier).toBe("hold");
  });

  it("should classify as hold when composite >= 0.72 but skills < 0.60", () => {
    const tier = classifyTier({
      compositeScore: 0.75,
      skillsScore: 0.55,
      mandatorySkillMissing: false,
    });
    expect(tier).toBe("hold");
  });

  it("should classify as reject when composite < 0.45", () => {
    const tier = classifyTier({
      compositeScore: 0.40,
      skillsScore: 0.80,
      mandatorySkillMissing: false,
    });
    expect(tier).toBe("reject");
  });

  it("should classify as reject when mandatory skill is missing", () => {
    const tier = classifyTier({
      compositeScore: 0.90,
      skillsScore: 0.95,
      mandatorySkillMissing: true,
    });
    expect(tier).toBe("reject");
  });

  it("should handle boundary case at exactly 0.72 composite + 0.60 skills", () => {
    const tier = classifyTier({
      compositeScore: 0.72,
      skillsScore: 0.60,
      mandatorySkillMissing: false,
    });
    expect(tier).toBe("shortlist");
  });

  it("should handle boundary case at exactly 0.45 composite", () => {
    const tier = classifyTier({
      compositeScore: 0.45,
      skillsScore: 0.30,
      mandatorySkillMissing: false,
    });
    expect(tier).toBe("hold");
  });
});

describe("P6-5: computeCompositeScore", () => {
  it("should compute weighted average of 5 dimensions", () => {
    const score = computeCompositeScore({
      skillsScore: 1.0,
      experienceScore: 1.0,
      educationScore: 1.0,
      domainScore: 1.0,
      trajectoryScore: 1.0,
    });
    expect(score).toBeCloseTo(1.0);
  });

  it("should apply correct weights", () => {
    const score = computeCompositeScore({
      skillsScore: 0.8,
      experienceScore: 0.6,
      educationScore: 0.9,
      domainScore: 0.7,
      trajectoryScore: 0.5,
    });
    const expected =
      0.8 * DIMENSION_WEIGHTS.skills +
      0.6 * DIMENSION_WEIGHTS.experience +
      0.9 * DIMENSION_WEIGHTS.education +
      0.7 * DIMENSION_WEIGHTS.domain +
      0.5 * DIMENSION_WEIGHTS.trajectory;
    expect(score).toBeCloseTo(expected);
  });

  it("should return 0 when all dimensions are 0", () => {
    const score = computeCompositeScore({
      skillsScore: 0,
      experienceScore: 0,
      educationScore: 0,
      domainScore: 0,
      trajectoryScore: 0,
    });
    expect(score).toBe(0);
  });
});

describe("P6-5: isDataSufficient", () => {
  it("should return false when parsedResume is null", () => {
    expect(isDataSufficient(null)).toBe(false);
  });

  it("should return false when less than 3 skills extracted", () => {
    expect(
      isDataSufficient({
        skills: ["Python", "SQL"],
        workExperience: [],
        education: [],
        totalYearsExperience: null,
      }),
    ).toBe(false);
  });

  it("should return true when 3+ skills extracted", () => {
    expect(
      isDataSufficient({
        skills: ["Python", "SQL", "React"],
        workExperience: [],
        education: [],
        totalYearsExperience: null,
      }),
    ).toBe(true);
  });
});
