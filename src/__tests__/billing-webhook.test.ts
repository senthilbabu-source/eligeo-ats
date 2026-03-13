import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────

const { mockSend, mockVerifyWebhookSignature } = vi.hoisted(() => {
  return {
    mockSend: vi.fn().mockResolvedValue(undefined),
    mockVerifyWebhookSignature: vi.fn(),
  };
});

vi.mock("@/inngest/client", () => ({
  inngest: { send: mockSend },
}));

vi.mock("@/lib/billing/stripe", () => ({
  verifyWebhookSignature: mockVerifyWebhookSignature,
}));

vi.mock("@/lib/utils/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { POST } from "@/app/api/webhooks/stripe/route";
import { NextRequest } from "next/server";

// ── Helpers ─────────────────────────────────────────────

function createRequest(body: string, signature: string | null = "sig_test"): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("stripe-signature", signature);
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body,
    headers,
  });
}

function makeStripeEvent(type: string, id = "evt_test_123") {
  return {
    id,
    type,
    data: {
      object: { id: "sub_test", customer: "cus_test" },
    },
  };
}

// ── Tests ───────────────────────────────────────────────

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when stripe-signature header is missing", async () => {
    const req = createRequest("{}", null);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing stripe-signature header");
  });

  it("should return 400 when signature verification fails", async () => {
    mockVerifyWebhookSignature.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const req = createRequest("{}", "invalid_sig");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid signature");
  });

  it("should dispatch checkout.session.completed to Inngest", async () => {
    const event = makeStripeEvent("checkout.session.completed");
    mockVerifyWebhookSignature.mockReturnValue(event);

    const req = createRequest(JSON.stringify(event));
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.handled).toBe(true);

    expect(mockSend).toHaveBeenCalledWith({
      name: "stripe/webhook.checkout-completed",
      data: {
        stripeEventId: "evt_test_123",
        stripeEventType: "checkout.session.completed",
        payload: event.data.object,
      },
    });
  });

  it("should dispatch customer.subscription.updated to Inngest", async () => {
    const event = makeStripeEvent("customer.subscription.updated");
    mockVerifyWebhookSignature.mockReturnValue(event);

    const req = createRequest(JSON.stringify(event));
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "stripe/webhook.subscription-updated",
      }),
    );
  });

  it("should dispatch customer.subscription.deleted to Inngest", async () => {
    const event = makeStripeEvent("customer.subscription.deleted");
    mockVerifyWebhookSignature.mockReturnValue(event);

    const req = createRequest(JSON.stringify(event));
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "stripe/webhook.subscription-canceled",
      }),
    );
  });

  it("should dispatch invoice.paid to Inngest", async () => {
    const event = makeStripeEvent("invoice.paid");
    mockVerifyWebhookSignature.mockReturnValue(event);

    const req = createRequest(JSON.stringify(event));
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "stripe/webhook.invoice-paid" }),
    );
  });

  it("should dispatch invoice.payment_failed to Inngest", async () => {
    const event = makeStripeEvent("invoice.payment_failed");
    mockVerifyWebhookSignature.mockReturnValue(event);

    const req = createRequest(JSON.stringify(event));
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "stripe/webhook.payment-failed" }),
    );
  });

  it("should dispatch customer.subscription.trial_will_end to Inngest", async () => {
    const event = makeStripeEvent("customer.subscription.trial_will_end");
    mockVerifyWebhookSignature.mockReturnValue(event);

    const req = createRequest(JSON.stringify(event));
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "stripe/webhook.trial-ending" }),
    );
  });

  it("should acknowledge but not dispatch unknown event types", async () => {
    const event = makeStripeEvent("charge.succeeded");
    mockVerifyWebhookSignature.mockReturnValue(event);

    const req = createRequest(JSON.stringify(event));
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.handled).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("should return 500 when Inngest dispatch fails", async () => {
    const event = makeStripeEvent("invoice.paid");
    mockVerifyWebhookSignature.mockReturnValue(event);
    mockSend.mockRejectedValueOnce(new Error("Inngest down"));

    const req = createRequest(JSON.stringify(event));
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Dispatch failed");
  });
});
