import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────

const { mockFrom } = vi.hoisted(() => {
  return { mockFrom: vi.fn() };
});

function createChainMock(resolveValue: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolveValue);
  chain.then = vi
    .fn()
    .mockImplementation((resolve: (v: unknown) => void) => resolve(resolveValue));
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
  createClient: vi.fn(),
}));

import {
  enforceSeatLimit,
  enforceJobLimit,
  enforceFeature,
} from "@/lib/billing/enforcement";

// ── enforceSeatLimit ────────────────────────────────────

describe("enforceSeatLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow when under included seat limit", async () => {
    // Count: 5 members, growth plan has 10 seats
    const countChain = createChainMock({ count: 5, data: null, error: null });
    const orgChain = createChainMock({
      data: { stripe_customer_id: null },
      error: null,
    });
    mockFrom.mockReturnValueOnce(countChain).mockReturnValueOnce(orgChain);

    const result = await enforceSeatLimit("org-123", "growth");
    expect(result.allowed).toBe(true);
  });

  it("should block when at limit without Stripe customer", async () => {
    // Count: 10 members, growth plan has 10 seats, no Stripe
    const countChain = createChainMock({ count: 10, data: null, error: null });
    const orgChain = createChainMock({
      data: { stripe_customer_id: null },
      error: null,
    });
    mockFrom.mockReturnValueOnce(countChain).mockReturnValueOnce(orgChain);

    const result = await enforceSeatLimit("org-123", "growth");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.upgradeRequired).toBe(true);
      expect(result.error).toContain("Seat limit reached");
    }
  });

  it("should allow extra seat when Stripe customer exists", async () => {
    // Count: 10 members, growth plan has 10 seats, but has Stripe
    const countChain = createChainMock({ count: 10, data: null, error: null });
    const orgChain = createChainMock({
      data: { stripe_customer_id: "cus_123" },
      error: null,
    });
    mockFrom.mockReturnValueOnce(countChain).mockReturnValueOnce(orgChain);

    const result = await enforceSeatLimit("org-123", "growth");
    expect(result.allowed).toBe(true);
  });

  it("should always allow for enterprise (unlimited)", async () => {
    const countChain = createChainMock({ count: 100, data: null, error: null });
    const orgChain = createChainMock({
      data: { stripe_customer_id: null },
      error: null,
    });
    mockFrom.mockReturnValueOnce(countChain).mockReturnValueOnce(orgChain);

    const result = await enforceSeatLimit("org-123", "enterprise");
    expect(result.allowed).toBe(true);
  });

  it("should block starter at 2 seats", async () => {
    const countChain = createChainMock({ count: 2, data: null, error: null });
    const orgChain = createChainMock({
      data: { stripe_customer_id: null },
      error: null,
    });
    mockFrom.mockReturnValueOnce(countChain).mockReturnValueOnce(orgChain);

    const result = await enforceSeatLimit("org-123", "starter");
    expect(result.allowed).toBe(false);
  });
});

// ── enforceJobLimit ─────────────────────────────────────

describe("enforceJobLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow when under limit", async () => {
    const countChain = createChainMock({ count: 3, data: null, error: null });
    mockFrom.mockReturnValue(countChain);

    const result = await enforceJobLimit("org-123", "starter");
    expect(result.allowed).toBe(true);
  });

  it("should block when at limit", async () => {
    // Starter has max 5 active jobs
    const countChain = createChainMock({ count: 5, data: null, error: null });
    mockFrom.mockReturnValue(countChain);

    const result = await enforceJobLimit("org-123", "starter");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error).toContain("Active job limit reached");
      expect(result.error).toContain("starter");
      expect(result.upgradeRequired).toBe(true);
    }
  });

  it("should always allow for pro (unlimited jobs)", async () => {
    const result = await enforceJobLimit("org-123", "pro");
    expect(result.allowed).toBe(true);
    // Should not even query the DB
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("should always allow for enterprise (unlimited jobs)", async () => {
    const result = await enforceJobLimit("org-123", "enterprise");
    expect(result.allowed).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("should block growth at 25 active jobs", async () => {
    const countChain = createChainMock({ count: 25, data: null, error: null });
    mockFrom.mockReturnValue(countChain);

    const result = await enforceJobLimit("org-123", "growth");
    expect(result.allowed).toBe(false);
  });
});

// ── enforceFeature ──────────────────────────────────────

describe("enforceFeature", () => {
  it("should allow feature enabled by plan", () => {
    const result = enforceFeature("pro", {}, "ai_matching");
    expect(result.allowed).toBe(true);
  });

  it("should block feature not in plan", () => {
    const result = enforceFeature("starter", {}, "ai_matching");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error).toContain("AI candidate matching");
      expect(result.error).toContain("starter");
      expect(result.upgradeRequired).toBe(true);
    }
  });

  it("should respect explicit override enabling a feature", () => {
    const result = enforceFeature("starter", { ai_matching: true }, "ai_matching");
    expect(result.allowed).toBe(true);
  });

  it("should respect explicit override disabling a feature", () => {
    const result = enforceFeature("pro", { ai_matching: false }, "ai_matching");
    expect(result.allowed).toBe(false);
  });

  it("should check ai_resume_parsing for growth plan", () => {
    // Growth has resume parsing
    const result = enforceFeature("growth", {}, "ai_resume_parsing");
    expect(result.allowed).toBe(true);
  });

  it("should block ai_resume_parsing for starter plan", () => {
    const result = enforceFeature("starter", {}, "ai_resume_parsing");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error).toContain("AI resume parsing");
    }
  });

  it("should check ai_scorecard_summarize for pro plan", () => {
    const result = enforceFeature("pro", {}, "ai_scorecard_summarize");
    expect(result.allowed).toBe(true);
  });

  it("should block ai_scorecard_summarize for growth plan", () => {
    const result = enforceFeature("growth", {}, "ai_scorecard_summarize");
    expect(result.allowed).toBe(false);
  });

  it("should check white_label for enterprise only", () => {
    expect(enforceFeature("enterprise", {}, "white_label").allowed).toBe(true);
    expect(enforceFeature("pro", {}, "white_label").allowed).toBe(false);
    expect(enforceFeature("growth", {}, "white_label").allowed).toBe(false);
  });

  it("should check sso_saml for enterprise only", () => {
    expect(enforceFeature("enterprise", {}, "sso_saml").allowed).toBe(true);
    expect(enforceFeature("pro", {}, "sso_saml").allowed).toBe(false);
  });
});
