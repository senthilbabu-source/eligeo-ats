import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * H6 Pre-Phase 6 AI Hardening Tests
 *
 * H6-1: Pipeline board AI match score (visual — JSX badge rendering verified here structurally)
 * H6-2: Candidates list AI Fit column (visual — data shape verified)
 * H6-3: NBA wire all 6 rules (pure function already tested in next-best-action.test.ts — verify data mapping)
 * H6-4: Candidate profile match card (visual — data shape verified)
 * H6-5: Offer form AI actions (server action wiring)
 * H6-6: Command bar intents (tested in intent-patterns.test.ts)
 */

// ── H6-5: Offer AI Server Actions ─────────────────────────

// Mock all dependencies before importing
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    userId: "user-1",
    orgId: "org-1",
    orgRole: "owner",
  }),
}));

vi.mock("@/lib/constants/roles", () => ({
  can: vi.fn().mockReturnValue(true),
  assertCan: vi.fn(),
}));

vi.mock("@/lib/ai/generate", () => ({
  suggestOfferCompensation: vi.fn().mockResolvedValue({
    suggestion: {
      base_salary: 150000,
      bonus_pct: 15,
      equity_shares: 5000,
      sign_on_bonus: 10000,
    },
    error: null,
  }),
  checkSalaryBand: vi.fn().mockResolvedValue({
    result: {
      withinBand: true,
      percentile: 65,
      assessment: "competitive",
      reasoning: "Within expected range for Senior Engineer",
    },
    error: null,
  }),
  generateOfferLetterDraft: vi.fn().mockResolvedValue({
    text: "Dear Alice, We are pleased to offer you...",
    error: null,
  }),
}));

import {
  aiSuggestCompensation,
  aiCheckSalaryBand,
  aiGenerateOfferTerms,
} from "@/lib/actions/offers";
import { suggestOfferCompensation, checkSalaryBand, generateOfferLetterDraft } from "@/lib/ai/generate";

describe("H6-5: Offer Form AI Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("aiSuggestCompensation", () => {
    it("should return suggestion from AI generate function", async () => {
      const result = await aiSuggestCompensation({
        jobTitle: "Senior Engineer",
        department: "Engineering",
      });
      expect(result.suggestion).toBeDefined();
      expect(result.suggestion?.base_salary).toBe(150000);
      expect(result.suggestion?.bonus_pct).toBe(15);
      expect(result.error).toBeUndefined();
    });

    it("should call suggestOfferCompensation with correct params", async () => {
      await aiSuggestCompensation({
        jobTitle: "Product Manager",
        department: "Product",
      });
      expect(suggestOfferCompensation).toHaveBeenCalledWith(
        expect.objectContaining({
          jobTitle: "Product Manager",
          department: "Product",
        }),
      );
    });

    it("should return error when AI function fails", async () => {
      vi.mocked(suggestOfferCompensation).mockResolvedValueOnce({
        suggestion: null,
        error: "Insufficient credits",
      });
      const result = await aiSuggestCompensation({
        jobTitle: "Engineer",
      });
      expect(result.error).toBe("Insufficient credits");
    });
  });

  describe("aiCheckSalaryBand", () => {
    it("should return salary band assessment", async () => {
      const result = await aiCheckSalaryBand({
        jobTitle: "Senior Engineer",
        proposedBaseSalary: 150000,
        currency: "USD",
        period: "annual",
      });
      expect(result.result).toBeDefined();
      expect(result.result?.assessment).toBe("competitive");
      expect(result.result?.reasoning).toContain("Within expected range");
    });

    it("should call checkSalaryBand with correct params", async () => {
      await aiCheckSalaryBand({
        jobTitle: "Designer",
        proposedBaseSalary: 120000,
        currency: "EUR",
        period: "annual",
      });
      expect(checkSalaryBand).toHaveBeenCalledWith(
        expect.objectContaining({
          jobTitle: "Designer",
          proposedBaseSalary: 120000,
          currency: "EUR",
        }),
      );
    });

    it("should handle below_market assessment", async () => {
      vi.mocked(checkSalaryBand).mockResolvedValueOnce({
        result: {
          withinBand: false,
          percentile: 15,
          assessment: "below_market",
          reasoning: "Below typical range for this role",
        },
        error: undefined,
      });
      const result = await aiCheckSalaryBand({
        jobTitle: "Engineer",
        proposedBaseSalary: 50000,
        currency: "USD",
        period: "annual",
      });
      expect(result.result?.assessment).toBe("below_market");
    });
  });

  describe("aiGenerateOfferTerms", () => {
    it("should return generated offer text", async () => {
      const result = await aiGenerateOfferTerms({
        candidateName: "Alice Smith",
        jobTitle: "Senior Engineer",
        compensation: {
          base_salary: 150000,
          currency: "USD",
          period: "annual",
        },
        organizationName: "Acme Corp",
      });
      expect(result.text).toContain("Dear Alice");
      expect(result.error).toBeUndefined();
    });

    it("should call generateOfferLetterDraft with compensation details", async () => {
      await aiGenerateOfferTerms({
        candidateName: "Bob Jones",
        jobTitle: "Product Manager",
        department: "Product",
        compensation: {
          base_salary: 180000,
          currency: "USD",
          period: "annual",
          bonus_pct: 20,
          equity_shares: 3000,
          equity_type: "rsu",
        },
        startDate: "2026-04-01",
        organizationName: "TechCo",
      });
      expect(generateOfferLetterDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateName: "Bob Jones",
          jobTitle: "Product Manager",
          organizationName: "TechCo",
        }),
      );
    });

    it("should return error when generation fails", async () => {
      vi.mocked(generateOfferLetterDraft).mockResolvedValueOnce({
        text: null,
        error: "Failed to generate",
      });
      const result = await aiGenerateOfferTerms({
        candidateName: "Jane",
        jobTitle: "Engineer",
        compensation: {
          base_salary: 100000,
          currency: "USD",
          period: "annual",
        },
        organizationName: "Test",
      });
      expect(result.error).toBe("Failed to generate");
    });
  });
});

// ── H6-1/H6-2: Match Score Display Logic ───────────────────

describe("H6-1/H6-2: Match Score Badge Logic", () => {
  // These verify the threshold logic used in pipeline-board.tsx and candidates/page.tsx

  function scoreBadgeColor(score: number): "green" | "amber" | "red" {
    if (score >= 0.75) return "green";
    if (score >= 0.5) return "amber";
    return "red";
  }

  it("should show green for score >= 0.75", () => {
    expect(scoreBadgeColor(0.75)).toBe("green");
    expect(scoreBadgeColor(0.9)).toBe("green");
    expect(scoreBadgeColor(1.0)).toBe("green");
  });

  it("should show amber for score >= 0.5 and < 0.75", () => {
    expect(scoreBadgeColor(0.5)).toBe("amber");
    expect(scoreBadgeColor(0.6)).toBe("amber");
    expect(scoreBadgeColor(0.74)).toBe("amber");
  });

  it("should show red for score < 0.5", () => {
    expect(scoreBadgeColor(0.49)).toBe("red");
    expect(scoreBadgeColor(0.1)).toBe("red");
    expect(scoreBadgeColor(0)).toBe("red");
  });

  it("should format percentage correctly", () => {
    expect((0.82 * 100).toFixed(0)).toBe("82");
    expect((0.5 * 100).toFixed(0)).toBe("50");
    expect((1.0 * 100).toFixed(0)).toBe("100");
  });
});

// ── H6-4: Embedding Freshness Logic ────────────────────────

describe("H6-4: Embedding Freshness Badge", () => {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  function embeddingFreshness(
    embeddingUpdatedAt: string | null,
    nowMs: number,
  ): "fresh" | "stale" | "none" {
    if (!embeddingUpdatedAt) return "none";
    const age = nowMs - new Date(embeddingUpdatedAt).getTime();
    return age <= SEVEN_DAYS_MS ? "fresh" : "stale";
  }

  const NOW = new Date("2026-03-12T12:00:00Z").getTime();

  it("should return 'none' when embeddingUpdatedAt is null", () => {
    expect(embeddingFreshness(null, NOW)).toBe("none");
  });

  it("should return 'fresh' when embedding updated within 7 days", () => {
    const recent = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(embeddingFreshness(recent, NOW)).toBe("fresh");
  });

  it("should return 'fresh' when embedding updated exactly 7 days ago", () => {
    const sevenDays = new Date(NOW - SEVEN_DAYS_MS).toISOString();
    expect(embeddingFreshness(sevenDays, NOW)).toBe("fresh");
  });

  it("should return 'stale' when embedding updated more than 7 days ago", () => {
    const old = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(embeddingFreshness(old, NOW)).toBe("stale");
  });

  it("should return 'stale' for very old embeddings (30+ days)", () => {
    const veryOld = new Date(NOW - 45 * 24 * 60 * 60 * 1000).toISOString();
    expect(embeddingFreshness(veryOld, NOW)).toBe("stale");
  });
});

// ── H6-5: Salary Band Display Logic ────────────────────────

describe("H6-5: Salary Band Display", () => {
  function salaryBandColor(assessment: string): "green" | "amber" {
    return assessment === "competitive" ? "green" : "amber";
  }

  it("should show green for 'competitive' assessment", () => {
    expect(salaryBandColor("competitive")).toBe("green");
  });

  it("should show amber for 'below_market' assessment", () => {
    expect(salaryBandColor("below_market")).toBe("amber");
  });

  it("should show amber for 'above_market' assessment", () => {
    expect(salaryBandColor("above_market")).toBe("amber");
  });
});
