import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P6-2b: Merge Candidates Tests
 *
 * Tests for AI merge confidence scoring (scoreMergeCandidates).
 * D32 §5.5 — gpt-4o-mini, 1 credit, conservative scoring.
 */

// ── Mock Dependencies ────────────────────────────────────

vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn().mockResolvedValue({
    object: {
      confidence: 0.87,
      reasoning: "Strong match: same phone number and similar name",
      signals: ["Matching phone", "Similar name"],
    },
    usage: { inputTokens: 120, outputTokens: 60 },
  }),
  streamText: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  chatModel: "gpt-4o-mini",
  smartModel: "gpt-4o",
  AI_MODELS: { fast: "gpt-4o-mini", smart: "gpt-4o", embedding: "text-embedding-3-small" },
}));

vi.mock("@/lib/ai/credits", () => ({
  consumeAiCredits: vi.fn().mockResolvedValue(true),
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/constants/config", () => ({
  CONFIG: { AI: { RESUME_TEXT_MAX: 15000, JOB_DESCRIPTION_MAX_TOKENS: 2000 } },
}));

import { scoreMergeCandidates } from "@/lib/ai/generate";
import { consumeAiCredits } from "@/lib/ai/credits";

describe("P6-2b: scoreMergeCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return confidence score and signals for matching candidates", async () => {
    const result = await scoreMergeCandidates({
      candidateA: {
        full_name: "Alice Johnson",
        email: "alice@example.com",
        phone: "555-1234",
      },
      candidateB: {
        full_name: "Alice J.",
        email: "alice.j@other.com",
        phone: "555-1234",
      },
      organizationId: "org-1",
    });

    expect(result.confidence).toBe(0.87);
    expect(result.signals).toContain("Matching phone");
    expect(result.reasoning).toContain("Strong match");
    expect(result.error).toBeUndefined();
  });

  it("should consume merge_score credits", async () => {
    await scoreMergeCandidates({
      candidateA: { full_name: "A" },
      candidateB: { full_name: "B" },
      organizationId: "org-1",
    });

    expect(consumeAiCredits).toHaveBeenCalledWith("org-1", "merge_score");
  });

  it("should return zero confidence when credits are insufficient", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValueOnce(false);

    const result = await scoreMergeCandidates({
      candidateA: { full_name: "Alice" },
      candidateB: { full_name: "Bob" },
      organizationId: "org-1",
    });

    expect(result.confidence).toBe(0);
    expect(result.error).toBe("Insufficient AI credits");
  });

  it("should handle AI errors gracefully", async () => {
    const { generateObject } = await import("ai");
    vi.mocked(generateObject).mockRejectedValueOnce(new Error("Model overloaded"));

    const result = await scoreMergeCandidates({
      candidateA: { full_name: "Alice" },
      candidateB: { full_name: "Alisa" },
      organizationId: "org-1",
    });

    expect(result.confidence).toBe(0);
    expect(result.error).toBe("Model overloaded");
  });

  it("should include optional fields in the comparison prompt", async () => {
    const { generateObject } = await import("ai");

    await scoreMergeCandidates({
      candidateA: {
        full_name: "Alice Johnson",
        email: "alice@example.com",
        phone: "555-1234",
        linkedin_url: "https://linkedin.com/in/alice",
        skills: ["TypeScript", "React"],
        current_company: "Acme Inc",
      },
      candidateB: {
        full_name: "Alice Johnson",
        email: "alice@work.com",
        linkedin_url: "https://linkedin.com/in/alice",
      },
      organizationId: "org-1",
    });

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("LinkedIn: https://linkedin.com/in/alice"),
      }),
    );
  });
});
