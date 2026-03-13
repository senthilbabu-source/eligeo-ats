/**
 * Unit Tests: send_offer command bar intent pattern
 * D32 §6.4 — command bar integration for send offer
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/ai/credits", () => ({
  consumeAiCredits: vi.fn().mockResolvedValue(true),
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ai/client", () => ({
  chatModel: "mock-model",
  smartModel: "mock-model",
  AI_MODELS: { CHAT: "gpt-4o-mini", SMART: "gpt-4o" },
}));

vi.mock("@/lib/constants/config", () => ({
  CONFIG: {
    AI: {
      INTENT_MAX_TOKENS: 200,
      JOB_DESCRIPTION_MAX_TOKENS: 2000,
      OFFER_LETTER_MAX_TOKENS: 2000,
    },
  },
}));

vi.mock("ai", () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: { action: "unknown", params: {}, confidence: 0, display: "" },
    usage: { inputTokens: 10, outputTokens: 5 },
  }),
  generateText: vi.fn().mockResolvedValue({
    text: "test",
    usage: { inputTokens: 10, outputTokens: 5 },
  }),
  streamText: vi.fn(),
}));

import { parseIntent } from "@/lib/ai/intent";

describe("send_offer intent pattern", () => {
  it("should match 'send offer for Alice'", async () => {
    const result = await parseIntent({
      input: "send offer for Alice",
      organizationId: "org-1",
    });
    expect(result.action).toBe("send_offer");
    expect(result.params.candidate).toBe("alice");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("should match 'send offer to Bob Smith'", async () => {
    const result = await parseIntent({
      input: "send offer to Bob Smith",
      organizationId: "org-1",
    });
    expect(result.action).toBe("send_offer");
    expect(result.params.candidate).toBe("bob smith");
  });

  it("should match 'dispatch offer for Carol'", async () => {
    const result = await parseIntent({
      input: "dispatch offer for Carol",
      organizationId: "org-1",
    });
    expect(result.action).toBe("send_offer");
    expect(result.params.candidate).toBe("carol");
  });

  it("should NOT match 'create offer for Alice' as send_offer", async () => {
    const result = await parseIntent({
      input: "create offer for Alice",
      organizationId: "org-1",
    });
    expect(result.action).toBe("create_offer");
  });
});
