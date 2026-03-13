import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P6-2a: AI Status Narration Tests
 *
 * Tests for the candidate portal AI narration function.
 * D32 §5.1 — gpt-4o-mini, 1 credit, warm professional tone.
 */

// ── Mock Dependencies ────────────────────────────────────

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "Your application is progressing well! Our team is currently reviewing your qualifications.",
    usage: { inputTokens: 80, outputTokens: 30 },
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  chatModel: "gpt-4o-mini",
  AI_MODELS: { fast: "gpt-4o-mini", smart: "gpt-4o", embedding: "text-embedding-3-small" },
}));

vi.mock("@/lib/ai/credits", () => ({
  consumeAiCredits: vi.fn().mockResolvedValue(true),
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}));

import { generateCandidateStatusNarration } from "@/lib/ai/status-narration";
import { consumeAiCredits } from "@/lib/ai/credits";

describe("P6-2a: generateCandidateStatusNarration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return a narration for a valid request", async () => {
    const result = await generateCandidateStatusNarration({
      stageType: "screening",
      daysInStage: 3,
      jobTitle: "Senior Engineer",
      orgName: "itecbrains",
      organizationId: "org-1",
    });

    expect(result.narration).toBeTruthy();
    expect(result.narration).toContain("progressing");
    expect(result.error).toBeUndefined();
  });

  it("should consume AI credits before generating", async () => {
    await generateCandidateStatusNarration({
      stageType: "interview",
      daysInStage: 1,
      jobTitle: "PM",
      orgName: "Acme",
      organizationId: "org-1",
    });

    expect(consumeAiCredits).toHaveBeenCalledWith("org-1", "status_narration");
  });

  it("should return empty narration when credits are insufficient", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValueOnce(false);

    const result = await generateCandidateStatusNarration({
      stageType: "applied",
      daysInStage: 0,
      jobTitle: "Designer",
      orgName: "Co",
      organizationId: "org-1",
    });

    expect(result.narration).toBe("");
    expect(result.error).toBe("Insufficient AI credits");
  });

  it("should handle AI generation errors gracefully", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("API timeout"));

    const result = await generateCandidateStatusNarration({
      stageType: "offer",
      daysInStage: 2,
      jobTitle: "Engineer",
      orgName: "Co",
      organizationId: "org-1",
    });

    expect(result.narration).toBe("");
    expect(result.error).toBe("API timeout");
  });
});
