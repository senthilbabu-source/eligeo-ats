import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { ProblemDetail } from "@/lib/utils/problem";

function mockErrorResponse(status: number): NextResponse<ProblemDetail> {
  return NextResponse.json(
    { type: "error", title: "Error", status, code: "TEST" } as ProblemDetail,
    { status },
  );
}

// ── Hoisted mocks ───────────────────────────────────────

const { mockFrom, mockStripeClient } = vi.hoisted(() => {
  return {
    mockFrom: vi.fn(),
    mockStripeClient: {
      customers: { create: vi.fn() },
      checkout: { sessions: { create: vi.fn() } },
      billingPortal: { sessions: { create: vi.fn() } },
      subscriptions: { list: vi.fn() },
    },
  };
});

function createChainMock(resolveValue: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolveValue);
  chain.then = vi
    .fn()
    .mockImplementation((resolve: (v: unknown) => void) => resolve(resolveValue));
  return chain;
}

vi.mock("@/lib/utils/csrf", () => ({
  checkCsrf: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/auth/api", () => ({
  requireAuthAPI: vi.fn(),
  requireRoleAPI: vi.fn(),
}));

vi.mock("@/lib/utils/problem", () => ({
  problemResponse: vi.fn(
    (status: number, code: string, title: string, detail?: string) =>
      NextResponse.json({ status, code, title, detail }, { status }),
  ),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
  createClient: vi.fn(),
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: vi.fn(() => mockStripeClient),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { requireAuthAPI, requireRoleAPI } from "@/lib/auth/api";
import { checkCsrf } from "@/lib/utils/csrf";

import { POST as checkoutSessionPOST } from "@/app/api/v1/billing/checkout-session/route";
import { POST as portalSessionPOST } from "@/app/api/v1/billing/portal-session/route";
import { GET as usageGET } from "@/app/api/v1/billing/usage/route";
import { GET as planGET } from "@/app/api/v1/billing/plan/route";

// ── Helpers ─────────────────────────────────────────────

const ownerSession = {
  orgId: "org-123",
  userId: "user-456",
  orgRole: "owner" as const,
  plan: "pro",
  featureFlags: {},
};

function mockPostRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/v1/billing/checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

// ── POST /api/v1/billing/checkout-session ───────────────

describe("POST /api/v1/billing/checkout-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRoleAPI).mockResolvedValue({ session: ownerSession, error: null });
  });

  it("should return 403 for non-owner", async () => {
    vi.mocked(requireRoleAPI).mockResolvedValue({ session: null, error: mockErrorResponse(403) });

    const req = mockPostRequest({ price_id: "price_123" });
    const res = await checkoutSessionPOST(req);
    expect(res.status).toBe(403);
  });

  it("should return 400 for invalid request body", async () => {
    const req = mockPostRequest({});
    const res = await checkoutSessionPOST(req);
    expect(res.status).toBe(400);
  });

  it("should create checkout session for existing Stripe customer", async () => {
    // Org has stripe_customer_id
    mockFrom.mockReturnValue(
      createChainMock({
        data: {
          id: "org-123",
          name: "Test Org",
          billing_email: "test@test.com",
          stripe_customer_id: "cus_existing",
        },
        error: null,
      }),
    );

    mockStripeClient.checkout.sessions.create.mockResolvedValue({
      url: "https://checkout.stripe.com/session_123",
    });

    const req = mockPostRequest({ price_id: "price_pro_monthly" });
    const res = await checkoutSessionPOST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.url).toBe("https://checkout.stripe.com/session_123");

    // Should NOT create a new customer
    expect(mockStripeClient.customers.create).not.toHaveBeenCalled();
  });

  it("should create Stripe customer when none exists", async () => {
    // Org has no stripe_customer_id
    const orgChain = createChainMock({
      data: {
        id: "org-123",
        name: "Test Org",
        billing_email: "test@test.com",
        stripe_customer_id: null,
      },
      error: null,
    });
    // Update chain for setting stripe_customer_id
    const updateChain = createChainMock({ data: null, error: null });

    mockFrom.mockReturnValueOnce(orgChain).mockReturnValueOnce(updateChain);

    mockStripeClient.customers.create.mockResolvedValue({ id: "cus_new" });
    mockStripeClient.checkout.sessions.create.mockResolvedValue({
      url: "https://checkout.stripe.com/session_456",
    });

    const req = mockPostRequest({ price_id: "price_pro_monthly", seat_count: 5 });
    const res = await checkoutSessionPOST(req);
    expect(res.status).toBe(200);

    expect(mockStripeClient.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Test Org",
        metadata: { organization_id: "org-123" },
      }),
    );
  });

  it("should fail CSRF check when blocked", async () => {
    const csrfResponse = NextResponse.json({ error: "Missing Origin header" }, { status: 403 });
    vi.mocked(checkCsrf).mockReturnValueOnce(csrfResponse);

    const req = mockPostRequest({ price_id: "price_123" });
    const res = await checkoutSessionPOST(req);
    expect(res.status).toBe(403);
  });
});

// ── POST /api/v1/billing/portal-session ─────────────────

describe("POST /api/v1/billing/portal-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRoleAPI).mockResolvedValue({ session: ownerSession, error: null });
  });

  it("should return portal URL for org with Stripe customer", async () => {
    mockFrom.mockReturnValue(
      createChainMock({
        data: { stripe_customer_id: "cus_existing" },
        error: null,
      }),
    );

    mockStripeClient.billingPortal.sessions.create.mockResolvedValue({
      url: "https://billing.stripe.com/portal_123",
    });

    const req = new Request("http://localhost:3000/api/v1/billing/portal-session", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    const res = await portalSessionPOST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.url).toBe("https://billing.stripe.com/portal_123");
  });

  it("should return 400 when no Stripe customer exists", async () => {
    mockFrom.mockReturnValue(
      createChainMock({
        data: { stripe_customer_id: null },
        error: null,
      }),
    );

    const req = new Request("http://localhost:3000/api/v1/billing/portal-session", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    const res = await portalSessionPOST(req);
    expect(res.status).toBe(400);
  });

  it("should return 403 for non-owner", async () => {
    vi.mocked(requireRoleAPI).mockResolvedValue({ session: null, error: mockErrorResponse(403) });

    const req = new Request("http://localhost:3000/api/v1/billing/portal-session", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    const res = await portalSessionPOST(req);
    expect(res.status).toBe(403);
  });
});

// ── GET /api/v1/billing/usage ───────────────────────────

describe("GET /api/v1/billing/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRoleAPI).mockResolvedValue({ session: ownerSession, error: null });
  });

  it("should return usage data with per-action breakdown", async () => {
    // Org credits
    const orgChain = createChainMock({
      data: { ai_credits_used: 150, ai_credits_limit: 2000 },
      error: null,
    });
    // Usage logs
    const logsChain = createChainMock({
      data: [
        { action: "resume_parse", credits_used: 2 },
        { action: "resume_parse", credits_used: 2 },
        { action: "candidate_match", credits_used: 1 },
      ],
      error: null,
    });

    mockFrom.mockReturnValueOnce(orgChain).mockReturnValueOnce(logsChain);

    const res = await usageGET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ai_credits_used).toBe(150);
    expect(body.ai_credits_limit).toBe(2000);
    expect(body.ai_credits_remaining).toBe(1850);
    expect(body.usage_by_action).toHaveLength(2);
  });

  it("should return 403 for non-owner/admin", async () => {
    vi.mocked(requireRoleAPI).mockResolvedValue({ session: null, error: mockErrorResponse(403) });

    const res = await usageGET();
    expect(res.status).toBe(403);
  });
});

// ── GET /api/v1/billing/plan ────────────────────────────

describe("GET /api/v1/billing/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthAPI).mockResolvedValue({ session: ownerSession, error: null });
  });

  it("should return plan details with resolved features", async () => {
    // Org data
    const orgChain = createChainMock({
      data: {
        plan: "pro",
        ai_credits_used: 100,
        ai_credits_limit: 2000,
        stripe_customer_id: null,
        feature_flags: {},
        subscription_status: "active",
      },
      error: null,
    });
    // Seat count
    const seatChain = createChainMock({ count: 12, data: null, error: null });

    mockFrom.mockReturnValueOnce(orgChain).mockReturnValueOnce(seatChain);

    const res = await planGET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.plan).toBe("pro");
    expect(body.seats_used).toBe(12);
    expect(body.seats_included).toBe(25);
    expect(body.ai_credits_used).toBe(100);
    expect(body.ai_credits_limit).toBe(2000);
    expect(body.features.ai_matching).toBe(true);
    expect(body.features.white_label).toBe(false);
    expect(body.billing_cycle).toBeNull(); // no stripe customer
    expect(body.cancel_at_period_end).toBe(false);
  });

  it("should return 401 for unauthenticated", async () => {
    vi.mocked(requireAuthAPI).mockResolvedValue({ session: null, error: mockErrorResponse(401) });

    const res = await planGET();
    expect(res.status).toBe(401);
  });

  it("should include billing cycle when Stripe subscription exists", async () => {
    const orgChain = createChainMock({
      data: {
        plan: "growth",
        ai_credits_used: 50,
        ai_credits_limit: 500,
        stripe_customer_id: "cus_test",
        feature_flags: {},
        subscription_status: "active",
      },
      error: null,
    });
    const seatChain = createChainMock({ count: 5, data: null, error: null });

    mockFrom.mockReturnValueOnce(orgChain).mockReturnValueOnce(seatChain);

    mockStripeClient.subscriptions.list.mockResolvedValue({
      data: [
        {
          items: {
            data: [{ price: { recurring: { interval: "month" } } }],
          },
          current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
          cancel_at_period_end: false,
        },
      ],
    });

    const res = await planGET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.plan).toBe("growth");
    expect(body.billing_cycle).toBe("monthly");
    expect(body.cancel_at_period_end).toBe(false);
    expect(body.current_period_end).toBeTruthy();
  });
});
