/**
 * Unit Tests: process-esign-webhook Inngest function
 * D32 §6.2 — webhook processing for signed/declined/canceled events
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────

const { mockFrom } = vi.hoisted(() => {
  return {
    mockFrom: vi.fn(),
  };
});

function createChainMock(resolveValue: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
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

vi.mock("@/lib/utils/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn(
      (_config: unknown, _trigger: unknown, handler: unknown) => handler,
    ),
  },
}));

import { processEsignWebhook } from "@/inngest/functions/offers/process-esign-webhook";

type StepMock = ReturnType<typeof createStepMock>;
type EventCtx = { event: { data: Record<string, unknown> }; step: StepMock };

const handler = processEsignWebhook as unknown as (ctx: EventCtx) => Promise<unknown>;

const ORG_ID = "org-test-123";
const OFFER_ID = "offer-test-456";

describe("processEsignWebhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should update offer to signed on signature_request_signed", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offers") {
        const chain = createChainMock({
          data: {
            id: OFFER_ID,
            status: "sent",
            candidate_id: "cand-1",
            job_id: "job-1",
            created_by: "user-1",
            esign_envelope_id: "sign-123",
          },
          error: null,
        });
        chain.update = vi.fn().mockReturnValue(
          createChainMock({ data: null, error: null }),
        );
        return chain;
      }
      if (table === "candidates") {
        return createChainMock({ data: { full_name: "Alice", email: "alice@test.com" }, error: null });
      }
      if (table === "job_openings") {
        return createChainMock({ data: { title: "Engineer" }, error: null });
      }
      if (table === "user_profiles") {
        return createChainMock({ data: { email: "recruiter@test.com" }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await handler({
      event: {
        data: {
          offerId: OFFER_ID,
          organizationId: ORG_ID,
          targetOfferStatus: "signed",
          signatureRequestId: "sign-123",
          dropboxSignEventType: "signature_request_signed",
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({
        processed: true,
        newStatus: "signed",
      }),
    );
    expect(step.run).toHaveBeenCalledWith("update-offer-status", expect.any(Function));
    expect(step.sendEvent).toHaveBeenCalledWith(
      "notify-recruiter",
      expect.objectContaining({
        name: "ats/notification.requested",
      }),
    );
  });

  it("should update offer to declined on signature_request_declined", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offers") {
        const chain = createChainMock({
          data: {
            id: OFFER_ID,
            status: "sent",
            candidate_id: "cand-1",
            job_id: "job-1",
            created_by: "user-1",
            esign_envelope_id: "sign-123",
          },
          error: null,
        });
        chain.update = vi.fn().mockReturnValue(
          createChainMock({ data: null, error: null }),
        );
        return chain;
      }
      if (table === "candidates") {
        return createChainMock({ data: { full_name: "Bob", email: "bob@test.com" }, error: null });
      }
      if (table === "job_openings") {
        return createChainMock({ data: { title: "Designer" }, error: null });
      }
      if (table === "user_profiles") {
        return createChainMock({ data: { email: "recruiter@test.com" }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await handler({
      event: {
        data: {
          offerId: OFFER_ID,
          organizationId: ORG_ID,
          targetOfferStatus: "declined",
          signatureRequestId: "sign-123",
          dropboxSignEventType: "signature_request_declined",
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({
        processed: true,
        newStatus: "declined",
      }),
    );
  });

  it("should skip if offer is not in sent state", async () => {
    mockFrom.mockImplementation(() =>
      createChainMock({
        data: {
          id: OFFER_ID,
          status: "signed",
          candidate_id: "cand-1",
          job_id: "job-1",
          created_by: "user-1",
          esign_envelope_id: "sign-123",
        },
        error: null,
      }),
    );

    const step = createStepMock();
    const result = await handler({
      event: {
        data: {
          offerId: OFFER_ID,
          organizationId: ORG_ID,
          targetOfferStatus: "signed",
          signatureRequestId: "sign-123",
          dropboxSignEventType: "signature_request_signed",
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({
        processed: false,
        reason: "invalid_status",
      }),
    );
  });

  it("should skip if offerId is missing from metadata", async () => {
    const step = createStepMock();
    const result = await handler({
      event: {
        data: {
          offerId: null,
          organizationId: null,
          targetOfferStatus: "signed",
          signatureRequestId: "sign-123",
          dropboxSignEventType: "signature_request_signed",
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({
        processed: false,
        reason: "missing_metadata",
      }),
    );
  });
});
