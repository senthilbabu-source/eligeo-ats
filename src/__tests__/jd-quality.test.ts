import { describe, it, expect } from "vitest";
import { analyzeGenderBalance, checkCompleteness, computeQualityScore } from "@/lib/utils/jd-quality";

describe("checkCompleteness (JD3)", () => {
  it("should pass all checks for a complete job description", () => {
    const result = checkCompleteness({
      description: "We are looking for a skilled engineer to join our team. This role reports to the VP of Engineering and involves building scalable systems. You will collaborate with stakeholders across the organization to drive impact. The ideal candidate has 5+ years of experience with modern web technologies including TypeScript, React, Node.js, and PostgreSQL. We offer a competitive compensation package and excellent benefits. The position is based in our Austin, TX headquarters with flexibility for hybrid work arrangements. You will be responsible for architecture decisions, system design, and mentoring junior engineers. Strong problem-solving skills are required along with excellent communication abilities. You will work closely with product managers, designers, and other engineers to deliver high-quality software. We value curiosity, ownership, and continuous learning. Our engineering team operates in two-week sprints and we have a strong culture of code review and documentation.",
      salaryMin: 120000,
      salaryMax: 160000,
      location: "Austin, TX",
    });
    expect(result.hasSalary).toBe(true);
    expect(result.hasLocation).toBe(true);
    expect(result.hasReportingLine).toBe(true);
    expect(result.hasMinLength).toBe(true);
    expect(result.passCount).toBe(4);
    expect(result.score).toBe(100);
  });

  it("should detect missing salary and reporting line", () => {
    const result = checkCompleteness({
      description: "A short description with enough words to pass length check. We are looking for a great engineer to join our amazing team. This role involves building scalable systems and collaborating with stakeholders. Strong problem-solving skills required along with excellent communication abilities and technical expertise.",
      salaryMin: null,
      salaryMax: null,
      location: "Remote",
    });
    expect(result.hasSalary).toBe(false);
    expect(result.hasReportingLine).toBe(false);
    expect(result.hasLocation).toBe(true);
  });

  it("should fail length check for very short description", () => {
    const result = checkCompleteness({
      description: "Short.",
      salaryMin: 100000,
      salaryMax: 120000,
      location: "NYC",
    });
    expect(result.hasMinLength).toBe(false);
  });
});

describe("analyzeGenderBalance (JD4)", () => {
  it("should detect masculine-coded language", () => {
    const result = analyzeGenderBalance(
      "We need a competitive, dominant, aggressive candidate who can outperform peers and drive decisive outcomes as a champion in the field.",
    );
    expect(result.masculineCount).toBeGreaterThan(result.feminineCount + 2);
    expect(result.label).toBe("masculine-coded");
  });

  it("should detect feminine-coded language", () => {
    const result = analyzeGenderBalance(
      "We are looking for a collaborative, supportive team member who is committed to community and loyal to our values. Empathetic and nurturing approach required.",
    );
    expect(result.feminineCount).toBeGreaterThan(result.masculineCount + 2);
    expect(result.label).toBe("feminine-coded");
  });

  it("should return balanced for neutral text", () => {
    const result = analyzeGenderBalance(
      "We are looking for an experienced software engineer with 5 years of experience in TypeScript and React.",
    );
    expect(result.label).toBe("balanced");
  });
});

describe("computeQualityScore (JD1)", () => {
  it("should return excellent for a complete, balanced, bias-free description", () => {
    const completeness = { hasSalary: true, hasLocation: true, hasReportingLine: true, hasMinLength: true, passCount: 4, totalCount: 4, score: 100 };
    const genderBalance = { masculineCount: 1, feminineCount: 2, masculineWords: ["competitive"], feminineWords: ["collaborative", "supportive"], score: -1, label: "balanced" as const };
    const result = computeQualityScore({ completeness, genderBalance, flaggedTermsCount: 0 });
    expect(result.total).toBe(100);
    expect(result.label).toBe("excellent");
  });

  it("should deduct points for bias terms", () => {
    const completeness = { hasSalary: true, hasLocation: true, hasReportingLine: true, hasMinLength: true, passCount: 4, totalCount: 4, score: 100 };
    const genderBalance = { masculineCount: 0, feminineCount: 0, masculineWords: [], feminineWords: [], score: 0, label: "balanced" as const };
    const noBias = computeQualityScore({ completeness, genderBalance, flaggedTermsCount: 0 });
    const withBias = computeQualityScore({ completeness, genderBalance, flaggedTermsCount: 4 });
    expect(withBias.biasScore).toBe(noBias.biasScore - 20);
    expect(withBias.total).toBeLessThan(noBias.total);
  });

  it("should label poor for a very incomplete description with bias", () => {
    const completeness = { hasSalary: false, hasLocation: false, hasReportingLine: false, hasMinLength: false, passCount: 0, totalCount: 4, score: 0 };
    const genderBalance = { masculineCount: 8, feminineCount: 0, masculineWords: [], feminineWords: [], score: 8, label: "masculine-coded" as const };
    const result = computeQualityScore({ completeness, genderBalance, flaggedTermsCount: 6 });
    expect(result.label).toBe("poor");
    expect(result.total).toBeLessThan(40);
  });
});
