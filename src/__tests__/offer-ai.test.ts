import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateText, generateObject } from "ai";
import { consumeAiCredits, logAiUsage } from "@/lib/ai/credits";
import {
  suggestOfferCompensation,
  generateOfferLetterDraft,
  checkSalaryBand,
  buildOfferCompContext,
} from "@/lib/ai/generate";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  chatModel: "mock-model",
  AI_MODELS: {
    fast: "gpt-4o-mini",
    smart: "gpt-4o",
    embedding: "text-embedding-3-small",
  },
}));

vi.mock("@/lib/ai/credits", () => ({
  consumeAiCredits: vi.fn(),
  logAiUsage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/constants/config", () => ({
  CONFIG: {
    AI: {
      JOB_DESCRIPTION_MAX_TOKENS: 1500,
      EMAIL_DRAFT_MAX_TOKENS: 500,
      OFFER_LETTER_MAX_TOKENS: 1000,
      OFFER_COMP_MAX_TOKENS: 300,
    },
  },
}));

const ORG_ID = "org-test-123";
const USER_ID = "user-test-456";

// ── buildOfferCompContext (pure function) ───────────────────

describe("buildOfferCompContext", () => {
  it("should include job title", () => {
    const lines = buildOfferCompContext({ jobTitle: "Senior Engineer" });
    expect(lines).toContain("Job title: Senior Engineer");
  });

  it("should include all optional fields when provided", () => {
    const lines = buildOfferCompContext({
      jobTitle: "Staff Engineer",
      department: "Engineering",
      level: "Staff",
      location: "San Francisco",
      orgDefaultCurrency: "USD",
      candidateCurrentComp: { base_salary: 180000, currency: "USD", period: "annual" },
    });
    expect(lines).toContain("Department: Engineering");
    expect(lines).toContain("Level: Staff");
    expect(lines).toContain("Location: San Francisco");
    expect(lines).toContain("Organization currency: USD");
    expect(lines.some((l) => l.includes("180000"))).toBe(true);
  });

  it("should omit optional fields when not provided", () => {
    const lines = buildOfferCompContext({ jobTitle: "Analyst" });
    expect(lines).toHaveLength(1);
  });
});

// ── suggestOfferCompensation ───────────────────────────────

describe("suggestOfferCompensation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return suggestion on success", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        base_salary: 150000,
        currency: "USD",
        period: "annual",
        bonus_pct: 15,
        reasoning: "Competitive for SF senior engineer market.",
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    } as ReturnType<typeof generateObject> extends Promise<infer U> ? U : never);

    const result = await suggestOfferCompensation({
      jobTitle: "Senior Engineer",
      location: "San Francisco",
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(result.suggestion).toBeDefined();
    expect(result.suggestion?.base_salary).toBe(150000);
    expect(result.error).toBeUndefined();
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "offer_compensation_suggest", status: "success" }),
    );
  });

  it("should return error when credits insufficient", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    const result = await suggestOfferCompensation({
      jobTitle: "Engineer",
      organizationId: ORG_ID,
    });

    expect(result.suggestion).toBeNull();
    expect(result.error).toBe("Insufficient AI credits");
  });

  it("should handle AI error gracefully", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockRejectedValue(new Error("API timeout"));

    const result = await suggestOfferCompensation({
      jobTitle: "Engineer",
      organizationId: ORG_ID,
    });

    expect(result.suggestion).toBeNull();
    expect(result.error).toBe("API timeout");
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "offer_compensation_suggest", status: "error" }),
    );
  });
});

// ── generateOfferLetterDraft ───────────────────────────────

describe("generateOfferLetterDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return offer letter text on success", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateText).mockResolvedValue({
      text: "Dear Alice Johnson,\n\nWe are pleased to offer you...",
      usage: { inputTokens: 200, outputTokens: 400 },
    } as ReturnType<typeof generateText> extends Promise<infer U> ? U : never);

    const result = await generateOfferLetterDraft({
      candidateName: "Alice Johnson",
      jobTitle: "Senior Engineer",
      compensation: { base_salary: 120000, currency: "USD", period: "annual" },
      organizationName: "itecbrains",
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(result.text).toContain("Alice Johnson");
    expect(result.error).toBeUndefined();
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "offer_letter_draft", status: "success" }),
    );
  });

  it("should include optional comp fields in prompt", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateText).mockResolvedValue({
      text: "Offer letter with equity...",
      usage: { inputTokens: 250, outputTokens: 500 },
    } as ReturnType<typeof generateText> extends Promise<infer U> ? U : never);

    const result = await generateOfferLetterDraft({
      candidateName: "Bob Smith",
      jobTitle: "Staff Engineer",
      department: "Platform",
      compensation: {
        base_salary: 200000,
        currency: "USD",
        period: "annual",
        equity_shares: 5000,
        equity_type: "rsu",
        equity_vesting: "4 years, 1-year cliff",
        sign_on_bonus: 25000,
      },
      startDate: "2026-04-01",
      termsTemplate: "Standard terms apply.",
      organizationName: "itecbrains",
      organizationId: ORG_ID,
    });

    expect(result.text).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("should return error when credits insufficient", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    const result = await generateOfferLetterDraft({
      candidateName: "Test",
      jobTitle: "Test",
      compensation: { base_salary: 100000, currency: "USD", period: "annual" },
      organizationName: "Test",
      organizationId: ORG_ID,
    });

    expect(result.text).toBeNull();
    expect(result.error).toBe("Insufficient AI credits");
  });

  it("should handle AI error gracefully", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateText).mockRejectedValue(new Error("Rate limited"));

    const result = await generateOfferLetterDraft({
      candidateName: "Test",
      jobTitle: "Test",
      compensation: { base_salary: 100000, currency: "USD", period: "annual" },
      organizationName: "Test",
      organizationId: ORG_ID,
    });

    expect(result.text).toBeNull();
    expect(result.error).toBe("Rate limited");
  });
});

// ── checkSalaryBand ────────────────────────────────────────

describe("checkSalaryBand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return salary band assessment on success", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        withinBand: true,
        percentile: 65,
        assessment: "competitive",
        reasoning: "This salary is above median for the role and location.",
      },
      usage: { inputTokens: 80, outputTokens: 60 },
    } as ReturnType<typeof generateObject> extends Promise<infer U> ? U : never);

    const result = await checkSalaryBand({
      jobTitle: "Senior Engineer",
      location: "Austin, TX",
      proposedBaseSalary: 160000,
      currency: "USD",
      period: "annual",
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(result.result).toBeDefined();
    expect(result.result?.assessment).toBe("competitive");
    expect(result.result?.percentile).toBe(65);
    expect(result.error).toBeUndefined();
  });

  it("should return below_market assessment", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        withinBand: false,
        percentile: 20,
        assessment: "below_market",
        reasoning: "Below typical range for this role in this market.",
      },
      usage: { inputTokens: 80, outputTokens: 60 },
    } as ReturnType<typeof generateObject> extends Promise<infer U> ? U : never);

    const result = await checkSalaryBand({
      jobTitle: "Senior Engineer",
      proposedBaseSalary: 90000,
      currency: "USD",
      period: "annual",
      organizationId: ORG_ID,
    });

    expect(result.result?.assessment).toBe("below_market");
    expect(result.result?.withinBand).toBe(false);
  });

  it("should return error when credits insufficient", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    const result = await checkSalaryBand({
      jobTitle: "Engineer",
      proposedBaseSalary: 100000,
      currency: "USD",
      period: "annual",
      organizationId: ORG_ID,
    });

    expect(result.result).toBeNull();
    expect(result.error).toBe("Insufficient AI credits");
  });

  it("should handle AI error gracefully", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockRejectedValue(new Error("Service unavailable"));

    const result = await checkSalaryBand({
      jobTitle: "Engineer",
      proposedBaseSalary: 100000,
      currency: "USD",
      period: "annual",
      organizationId: ORG_ID,
    });

    expect(result.result).toBeNull();
    expect(result.error).toBe("Service unavailable");
  });
});
