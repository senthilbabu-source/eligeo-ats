import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({
  chatModel: "mock-model",
  AI_MODELS: { fast: "gpt-4o-mini" },
}));
vi.mock("@/lib/ai/credits", () => ({
  consumeAiCredits: vi.fn().mockResolvedValue(false), // force quick-pattern path
  logAiUsage: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/constants/config", () => ({
  CONFIG: { AI: { INTENT_MAX_TOKENS: 100 } },
}));

import { parseIntent } from "@/lib/ai/intent";

const ORG_ID = "org-test-123";

describe("parseIntent — offer quick patterns (B-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── create_offer patterns ──────────────────────────────────

  it("should parse 'create offer for Alice' as create_offer", async () => {
    const result = await parseIntent({ input: "create offer for Alice", organizationId: ORG_ID });
    expect(result.action).toBe("create_offer");
    expect(result.params.candidate).toBe("alice");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("should parse 'new offer for Bob Smith' as create_offer", async () => {
    const result = await parseIntent({ input: "new offer for Bob Smith", organizationId: ORG_ID });
    expect(result.action).toBe("create_offer");
    expect(result.params.candidate).toBe("bob smith");
  });

  it("should parse 'draft offer Alice Johnson' as create_offer", async () => {
    const result = await parseIntent({ input: "draft offer Alice Johnson", organizationId: ORG_ID });
    expect(result.action).toBe("create_offer");
    expect(result.params.candidate).toBe("alice johnson");
  });

  it("should parse 'make offer for Carol' as create_offer", async () => {
    const result = await parseIntent({ input: "make offer for Carol", organizationId: ORG_ID });
    expect(result.action).toBe("create_offer");
    expect(result.params.candidate).toBe("carol");
  });

  // ── check_offer patterns ───────────────────────────────────

  it("should parse 'check offers for Alice' as check_offer", async () => {
    const result = await parseIntent({ input: "check offers for Alice", organizationId: ORG_ID });
    expect(result.action).toBe("check_offer");
    expect(result.params.candidate).toBe("alice");
  });

  it("should parse 'show offers' as navigate (navigation takes priority)", async () => {
    const result = await parseIntent({ input: "show offers", organizationId: ORG_ID });
    expect(result.action).toBe("navigate");
    expect(result.params.page).toBe("offers");
  });

  it("should parse 'list offers' as check_offer", async () => {
    const result = await parseIntent({ input: "list offers", organizationId: ORG_ID });
    expect(result.action).toBe("check_offer");
  });

  it("should parse 'check offer' (singular) as check_offer", async () => {
    const result = await parseIntent({ input: "check offer", organizationId: ORG_ID });
    expect(result.action).toBe("check_offer");
  });

  it("should parse 'offer status Bob' as check_offer with candidate", async () => {
    const result = await parseIntent({ input: "offer status Bob", organizationId: ORG_ID });
    expect(result.action).toBe("check_offer");
    expect(result.params.candidate).toBe("bob");
  });

  it("should parse 'offer status' as check_offer with no candidate", async () => {
    const result = await parseIntent({ input: "offer status", organizationId: ORG_ID });
    expect(result.action).toBe("check_offer");
  });

  // ── offer navigation ──────────────────────────────────────

  it("should parse 'offers' as navigate to offers", async () => {
    const result = await parseIntent({ input: "offers", organizationId: ORG_ID });
    expect(result.action).toBe("navigate");
    expect(result.params.page).toBe("offers");
  });

  it("should parse 'go to approvals' as navigate to approvals", async () => {
    const result = await parseIntent({ input: "go to approvals", organizationId: ORG_ID });
    expect(result.action).toBe("navigate");
    expect(result.params.page).toBe("approvals");
  });

  it("should parse 'my approvals' as navigate to approvals", async () => {
    const result = await parseIntent({ input: "my approvals", organizationId: ORG_ID });
    expect(result.action).toBe("navigate");
    expect(result.params.page).toBe("approvals");
  });

  it("should parse 'approval inbox' as navigate to approvals", async () => {
    const result = await parseIntent({ input: "approval inbox", organizationId: ORG_ID });
    expect(result.action).toBe("navigate");
    expect(result.params.page).toBe("approvals");
  });

  // ── existing patterns still work ──────────────────────────

  it("should still parse 'jobs' as navigate", async () => {
    const result = await parseIntent({ input: "jobs", organizationId: ORG_ID });
    expect(result.action).toBe("navigate");
    expect(result.params.page).toBe("jobs");
  });

  it("should still parse 'clone Backend Engineer for Austin' as clone_job", async () => {
    const result = await parseIntent({ input: "clone Backend Engineer for Austin", organizationId: ORG_ID });
    expect(result.action).toBe("clone_job");
    expect(result.params.reason).toBe("new_location");
  });
});
