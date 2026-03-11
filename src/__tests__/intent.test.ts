import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({
  chatModel: "mock-model",
  AI_MODELS: { fast: "gpt-4o-mini" },
}));
vi.mock("@/lib/ai/credits", () => ({
  consumeAiCredits: vi.fn().mockResolvedValue(false), // default: force quick-pattern path
  logAiUsage: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/constants/config", () => ({
  CONFIG: { AI: { INTENT_MAX_TOKENS: 100 } },
}));

import { parseIntent } from "@/lib/ai/intent";

const ORG_ID = "org-test-123";

describe("parseIntent — clone_job quick patterns (E2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse 'clone [title] for [location]' as clone_job with new_location reason", async () => {
    const result = await parseIntent({ input: "clone Backend Engineer for Austin", organizationId: ORG_ID });
    expect(result.action).toBe("clone_job");
    expect(result.params.reason).toBe("new_location");
    expect(result.params.title).toBe("backend engineer");
    expect(result.params.location).toBe("austin");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("should parse 'repost [title]' as clone_job with repost reason", async () => {
    const result = await parseIntent({ input: "repost Senior Designer", organizationId: ORG_ID });
    expect(result.action).toBe("clone_job");
    expect(result.params.reason).toBe("repost");
    expect(result.params.title).toBe("senior designer");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("should parse 'clone [title] for [level] level' as clone_job with new_level reason", async () => {
    const result = await parseIntent({ input: "clone Software Engineer for Staff level", organizationId: ORG_ID });
    expect(result.action).toBe("clone_job");
    expect(result.params.reason).toBe("new_level");
    expect(result.params.level).toBe("staff");
  });

  it("should still match navigation patterns normally", async () => {
    const result = await parseIntent({ input: "jobs", organizationId: ORG_ID });
    expect(result.action).toBe("navigate");
    expect(result.params.page).toBe("jobs");
  });
});
