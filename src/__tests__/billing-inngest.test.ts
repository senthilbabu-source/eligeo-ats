import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────

const { mockFrom, mockStripeClient } = vi.hoisted(() => {
  return {
    mockFrom: vi.fn(),
    mockStripeClient: {
      subscriptions: {
        retrieve: vi.fn(),
      },
      products: {
        retrieve: vi.fn(),
      },
      billing: {
        meterEvents: {
          create: vi.fn(),
        },
      },
    },
  };
});

function createChainMock(resolveValue: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolveValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveValue);
  chain.then = vi
    .fn()
    .mockImplementation((resolve: (v: unknown) => void) => resolve(resolveValue));
  return chain;
}

function createStepMock() {
  return {
    run: vi.fn((_name: string, fn: () => unknown) => fn()),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
  createClient: vi.fn(),
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: vi.fn(() => mockStripeClient),
}));

vi.mock("@/lib/utils/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn(
      (_config: unknown, _trigger: unknown, handler: unknown) => handler,
    ),
  },
}));

import { billingCheckoutCompleted } from "@/inngest/functions/billing/checkout-completed";
import { billingSubscriptionUpdated } from "@/inngest/functions/billing/subscription-updated";
import { billingSubscriptionCanceled } from "@/inngest/functions/billing/subscription-canceled";
import { billingInvoicePaid } from "@/inngest/functions/billing/invoice-paid";
import { billingPaymentFailed } from "@/inngest/functions/billing/payment-failed";
import { billingTrialEnding } from "@/inngest/functions/billing/trial-ending";
import { billingReportOverage } from "@/inngest/functions/billing/report-overage";

// ── Type helpers ────────────────────────────────────────
type StepMock = ReturnType<typeof createStepMock>;
type EventCtx = { event: { data: Record<string, unknown> }; step: StepMock };
type CronCtx = { step: StepMock };

const checkoutHandler = billingCheckoutCompleted as unknown as (ctx: EventCtx) => Promise<unknown>;
const subUpdatedHandler = billingSubscriptionUpdated as unknown as (ctx: EventCtx) => Promise<unknown>;
const subCanceledHandler = billingSubscriptionCanceled as unknown as (ctx: EventCtx) => Promise<unknown>;
const invoicePaidHandler = billingInvoicePaid as unknown as (ctx: EventCtx) => Promise<unknown>;
const paymentFailedHandler = billingPaymentFailed as unknown as (ctx: EventCtx) => Promise<unknown>;
const trialEndingHandler = billingTrialEnding as unknown as (ctx: EventCtx) => Promise<unknown>;
const reportOverageHandler = billingReportOverage as unknown as (ctx: CronCtx) => Promise<unknown>;

// ── Shared fixtures ─────────────────────────────────────
const ORG_ID = "org-billing-test";
const CUSTOMER_ID = "cus_test_123";
const SUB_ID = "sub_test_456";

describe("billing/checkout-completed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update org plan and credits on checkout", async () => {
    const step = createStepMock();

    // Mock: find org by customer
    mockFrom.mockReturnValue(
      createChainMock({ data: { id: ORG_ID }, error: null }),
    );

    // Mock Stripe API
    mockStripeClient.subscriptions.retrieve.mockResolvedValue({
      id: SUB_ID,
      items: { data: [{ price: { product: "prod_123" } }] },
    });
    mockStripeClient.products.retrieve.mockResolvedValue({
      metadata: { plan_tier: "pro" },
    });

    const result = await checkoutHandler({
      event: {
        data: {
          stripeEventId: "evt_test",
          payload: {
            id: "cs_test",
            customer: CUSTOMER_ID,
            subscription: SUB_ID,
          },
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({ processed: true, plan: "pro" }),
    );

    // Verify org update was called
    expect(mockFrom).toHaveBeenCalledWith("organizations");

    // Verify welcome notification was sent
    expect(step.sendEvent).toHaveBeenCalledWith(
      "send-welcome",
      expect.objectContaining({
        name: "ats/notification.requested",
        data: expect.objectContaining({
          eventType: "billing.checkout_completed",
        }),
      }),
    );
  });

  it("should return not processed when org not found", async () => {
    const step = createStepMock();

    // No org found
    mockFrom.mockReturnValue(
      createChainMock({ data: null, error: null }),
    );

    const result = await checkoutHandler({
      event: {
        data: {
          stripeEventId: "evt_test",
          payload: { id: "cs_test", customer: "cus_unknown", subscription: SUB_ID },
        },
      },
      step,
    });

    expect(result).toEqual({ processed: false, reason: "org_not_found" });
  });
});

describe("billing/subscription-updated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should sync plan tier and status on subscription update", async () => {
    const step = createStepMock();

    // Mock: find org
    const findOrgChain = createChainMock({
      data: { id: ORG_ID, plan: "growth" },
      error: null,
    });
    // Mock: update org
    const updateChain = createChainMock({ data: null, error: null });

    mockFrom
      .mockReturnValueOnce(findOrgChain) // find-org
      .mockReturnValueOnce(updateChain); // update-org

    mockStripeClient.products.retrieve.mockResolvedValue({
      metadata: { plan_tier: "pro" },
    });

    const result = await subUpdatedHandler({
      event: {
        data: {
          stripeEventId: "evt_test",
          payload: {
            id: SUB_ID,
            customer: CUSTOMER_ID,
            status: "active",
            items: { data: [{ price: { product: "prod_pro" } }] },
          },
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({
        processed: true,
        plan: "pro",
        subscriptionStatus: "active",
      }),
    );
  });

  it("should return not processed when org not found", async () => {
    const step = createStepMock();

    mockFrom.mockReturnValue(
      createChainMock({ data: null, error: null }),
    );

    const result = await subUpdatedHandler({
      event: {
        data: {
          stripeEventId: "evt_test",
          payload: { id: SUB_ID, customer: "cus_unknown", status: "active" },
        },
      },
      step,
    });

    expect(result).toEqual({ processed: false, reason: "org_not_found" });
  });
});

describe("billing/subscription-canceled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should downgrade org to starter on cancellation", async () => {
    const step = createStepMock();

    const findOrgChain = createChainMock({
      data: { id: ORG_ID, plan: "pro" },
      error: null,
    });
    const updateChain = createChainMock({ data: null, error: null });

    mockFrom
      .mockReturnValueOnce(findOrgChain)
      .mockReturnValueOnce(updateChain);

    const result = await subCanceledHandler({
      event: {
        data: {
          stripeEventId: "evt_test",
          payload: { id: SUB_ID, customer: CUSTOMER_ID },
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({
        processed: true,
        previousPlan: "pro",
      }),
    );

    // Verify cancellation notification
    expect(step.sendEvent).toHaveBeenCalledWith(
      "send-cancellation-notification",
      expect.objectContaining({
        name: "ats/notification.requested",
        data: expect.objectContaining({
          eventType: "billing.subscription_canceled",
        }),
      }),
    );
  });
});

describe("billing/invoice-paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reset AI credits on invoice payment", async () => {
    const step = createStepMock();

    mockFrom.mockReturnValue(
      createChainMock({
        data: { id: ORG_ID, plan: "pro", ai_credits_limit: 2000 },
        error: null,
      }),
    );

    const result = await invoicePaidHandler({
      event: {
        data: {
          stripeEventId: "evt_test",
          payload: { id: "inv_test", customer: CUSTOMER_ID },
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({ processed: true, creditsReset: true }),
    );
  });

  it("should return not processed when org not found", async () => {
    const step = createStepMock();

    mockFrom.mockReturnValue(
      createChainMock({ data: null, error: null }),
    );

    const result = await invoicePaidHandler({
      event: {
        data: {
          stripeEventId: "evt_test",
          payload: { id: "inv_test", customer: "cus_unknown" },
        },
      },
      step,
    });

    expect(result).toEqual({ processed: false, reason: "org_not_found" });
  });
});

describe("billing/payment-failed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should dispatch dunning notification on payment failure", async () => {
    const step = createStepMock();

    mockFrom.mockReturnValue(
      createChainMock({
        data: { id: ORG_ID, billing_email: "billing@test.com" },
        error: null,
      }),
    );

    const result = await paymentFailedHandler({
      event: {
        data: {
          stripeEventId: "evt_test",
          payload: { id: "inv_test", customer: CUSTOMER_ID, attempt_count: 2 },
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({ processed: true, attemptCount: 2 }),
    );

    expect(step.sendEvent).toHaveBeenCalledWith(
      "send-dunning-notification",
      expect.objectContaining({
        name: "ats/notification.requested",
        data: expect.objectContaining({
          eventType: "billing.payment_failed",
          variables: expect.objectContaining({ attemptCount: 2 }),
        }),
      }),
    );
  });
});

describe("billing/trial-ending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should dispatch trial-ending notification", async () => {
    const step = createStepMock();

    mockFrom.mockReturnValue(
      createChainMock({
        data: { id: ORG_ID, name: "Test Org", billing_email: "billing@test.com" },
        error: null,
      }),
    );

    const trialEnd = Math.floor(Date.now() / 1000) + 3 * 86400; // 3 days from now

    const result = await trialEndingHandler({
      event: {
        data: {
          stripeEventId: "evt_test",
          payload: { id: SUB_ID, customer: CUSTOMER_ID, trial_end: trialEnd },
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({ processed: true, orgId: ORG_ID }),
    );

    expect(step.sendEvent).toHaveBeenCalledWith(
      "send-trial-ending-notification",
      expect.objectContaining({
        name: "ats/notification.requested",
        data: expect.objectContaining({
          eventType: "billing.trial_ending",
          variables: expect.objectContaining({
            orgName: "Test Org",
          }),
        }),
      }),
    );
  });

  it("should return not processed when org not found", async () => {
    const step = createStepMock();

    mockFrom.mockReturnValue(
      createChainMock({ data: null, error: null }),
    );

    const result = await trialEndingHandler({
      event: {
        data: {
          stripeEventId: "evt_test",
          payload: { id: SUB_ID, customer: "cus_unknown" },
        },
      },
      step,
    });

    expect(result).toEqual({ processed: false, reason: "org_not_found" });
  });
});

describe("billing/report-overage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should report overage to Stripe for orgs over limit", async () => {
    const step = createStepMock();

    // Mock: find orgs with overage
    const listChain = createChainMock({
      data: [
        {
          id: ORG_ID,
          stripe_customer_id: CUSTOMER_ID,
          ai_credits_used: 650,
          ai_credits_limit: 500,
        },
      ],
      error: null,
    });

    mockFrom.mockReturnValue(listChain);

    const result = await reportOverageHandler({ step });

    expect(result).toEqual(
      expect.objectContaining({ processed: true }),
    );

    // Verify Stripe meter event was created
    expect(mockStripeClient.billing.meterEvents.create).toHaveBeenCalledWith({
      event_name: "ai_credit_overage",
      payload: {
        stripe_customer_id: CUSTOMER_ID,
        value: "2", // ceil(150/100) = 2
      },
    });
  });

  it("should report nothing when no orgs have overage", async () => {
    const step = createStepMock();

    // No orgs over limit
    const listChain = createChainMock({
      data: [
        {
          id: ORG_ID,
          stripe_customer_id: CUSTOMER_ID,
          ai_credits_used: 100,
          ai_credits_limit: 500,
        },
      ],
      error: null,
    });

    mockFrom.mockReturnValue(listChain);

    const result = await reportOverageHandler({ step });

    expect(result).toEqual({ processed: true, reported: 0 });
    expect(mockStripeClient.billing.meterEvents.create).not.toHaveBeenCalled();
  });
});
