import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
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

import { offerApprovalNotify } from "@/inngest/functions/offers/approval-notify";
import { offerApprovalAdvanced } from "@/inngest/functions/offers/approval-advanced";
import { offerCheckExpiry } from "@/inngest/functions/offers/check-expiry";
import { offerWithdraw } from "@/inngest/functions/offers/withdraw";
import { offerSendEsign } from "@/inngest/functions/offers/send-esign";

// ── Type helpers ────────────────────────────────────────
type StepMock = ReturnType<typeof createStepMock>;
type EventCtx = { event: { data: Record<string, unknown> }; step: StepMock };
type CronCtx = { step: StepMock };

const approvalNotifyHandler = offerApprovalNotify as unknown as (ctx: EventCtx) => Promise<unknown>;
const approvalAdvancedHandler = offerApprovalAdvanced as unknown as (ctx: EventCtx) => Promise<unknown>;
const checkExpiryHandler = offerCheckExpiry as unknown as (ctx: CronCtx) => Promise<unknown>;
const withdrawHandler = offerWithdraw as unknown as (ctx: EventCtx) => Promise<unknown>;
const sendEsignHandler = offerSendEsign as unknown as (ctx: EventCtx) => Promise<unknown>;

// ── Shared fixtures ─────────────────────────────────────
const ORG_ID = "org-test-123";
const OFFER_ID = "offer-test-456";
const USER_ID = "user-test-789";

// ── approval-notify ─────────────────────────────────────

describe("offerApprovalNotify", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should notify the first pending approver", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offer_approvals") {
        return createChainMock({
          data: [
            { id: "appr-1", approver_id: "approver-a", sequence_order: 1, status: "pending" },
          ],
          error: null,
        });
      }
      if (table === "user_profiles") {
        return createChainMock({ data: { email: "approver@test.com" }, error: null });
      }
      if (table === "offers") {
        return createChainMock({
          data: { id: OFFER_ID, candidate_id: "cand-1", job_id: "job-1" },
          error: null,
        });
      }
      if (table === "candidates") {
        return createChainMock({ data: { full_name: "Alice" }, error: null });
      }
      if (table === "job_openings") {
        return createChainMock({ data: { title: "Engineer" }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await approvalNotifyHandler({
      event: {
        data: { offerId: OFFER_ID, organizationId: ORG_ID, submittedBy: USER_ID },
      },
      step,
    });

    expect(result).toEqual(expect.objectContaining({ notified: true, approverId: "approver-a" }));
    expect(step.sendEvent).toHaveBeenCalledWith(
      "send-approval-notification",
      expect.objectContaining({
        name: "ats/notification.requested",
      }),
    );
  });

  it("should skip when no pending approvers", async () => {
    mockFrom.mockImplementation(() =>
      createChainMock({ data: [], error: null }),
    );

    const step = createStepMock();
    const result = await approvalNotifyHandler({
      event: {
        data: { offerId: OFFER_ID, organizationId: ORG_ID, submittedBy: USER_ID },
      },
      step,
    });

    expect(result).toEqual(expect.objectContaining({ notified: false, reason: "no_pending_approvers" }));
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it("should skip when approver email is missing", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offer_approvals") {
        return createChainMock({
          data: [
            { id: "appr-1", approver_id: "approver-a", sequence_order: 1, status: "pending" },
          ],
          error: null,
        });
      }
      // user_profiles returns null email
      return createChainMock({ data: { email: null }, error: null });
    });

    const step = createStepMock();
    const result = await approvalNotifyHandler({
      event: {
        data: { offerId: OFFER_ID, organizationId: ORG_ID, submittedBy: USER_ID },
      },
      step,
    });

    expect(result).toEqual(expect.objectContaining({ notified: false, reason: "approver_email_missing" }));
  });
});

// ── approval-advanced ───────────────────────────────────

describe("offerApprovalAdvanced", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should advance to approved when chain is complete", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offer_approvals") {
        return createChainMock({
          data: [
            { id: "appr-1", approver_id: "a-1", sequence_order: 1, status: "approved" },
          ],
          error: null,
        });
      }
      if (table === "offers") {
        const chain = createChainMock({ data: { created_by: USER_ID, candidate_id: "cand-1", job_id: "job-1" }, error: null });
        chain.update = vi.fn().mockReturnValue(
          createChainMock({ data: null, error: null }),
        );
        return chain;
      }
      if (table === "user_profiles") {
        return createChainMock({ data: { email: "recruiter@test.com" }, error: null });
      }
      if (table === "candidates") {
        return createChainMock({ data: { full_name: "Alice" }, error: null });
      }
      if (table === "job_openings") {
        return createChainMock({ data: { title: "Engineer" }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await approvalAdvancedHandler({
      event: {
        data: {
          offerId: OFFER_ID,
          organizationId: ORG_ID,
          decision: "approved",
          decidedBy: USER_ID,
        },
      },
      step,
    });

    expect(result).toEqual(expect.objectContaining({ result: "fully_approved" }));
    expect(step.sendEvent).toHaveBeenCalledWith(
      "notify-fully-approved",
      expect.objectContaining({
        name: "ats/notification.requested",
      }),
    );
  });

  it("should notify next approver when chain has more pending", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offer_approvals") {
        return createChainMock({
          data: [
            { id: "appr-1", approver_id: "a-1", sequence_order: 1, status: "approved" },
            { id: "appr-2", approver_id: "a-2", sequence_order: 2, status: "pending" },
          ],
          error: null,
        });
      }
      if (table === "organization_members") {
        return createChainMock({ data: { id: "member-1" }, error: null });
      }
      if (table === "user_profiles") {
        return createChainMock({ data: { email: "next-approver@test.com" }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await approvalAdvancedHandler({
      event: {
        data: {
          offerId: OFFER_ID,
          organizationId: ORG_ID,
          decision: "approved",
          decidedBy: USER_ID,
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({ result: "next_approver_notified", nextApproverId: "a-2" }),
    );
  });

  it("should handle rejection by notifying recruiter", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offers") {
        return createChainMock({
          data: { created_by: USER_ID, candidate_id: "cand-1", job_id: "job-1" },
          error: null,
        });
      }
      if (table === "user_profiles") {
        return createChainMock({ data: { email: "recruiter@test.com" }, error: null });
      }
      if (table === "offer_approvals") {
        return createChainMock({ data: { notes: "Too high" }, error: null });
      }
      if (table === "candidates") {
        return createChainMock({ data: { full_name: "Alice" }, error: null });
      }
      if (table === "job_openings") {
        return createChainMock({ data: { title: "Engineer" }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await approvalAdvancedHandler({
      event: {
        data: {
          offerId: OFFER_ID,
          organizationId: ORG_ID,
          decision: "rejected",
          decidedBy: "rejector-1",
        },
      },
      step,
    });

    expect(result).toEqual(expect.objectContaining({ result: "rejection_notified" }));
    expect(step.sendEvent).toHaveBeenCalledWith(
      "notify-recruiter-rejection",
      expect.objectContaining({
        name: "ats/notification.requested",
      }),
    );
  });

  it("should auto-skip approver removed from org (G-022)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offer_approvals") {
        const chain = createChainMock({
          data: [
            { id: "appr-1", approver_id: "a-1", sequence_order: 1, status: "approved" },
            { id: "appr-2", approver_id: "a-removed", sequence_order: 2, status: "pending" },
          ],
          error: null,
        });
        chain.update = vi.fn().mockReturnValue(
          createChainMock({ data: null, error: null }),
        );
        return chain;
      }
      if (table === "organization_members") {
        // Approver NOT found — removed from org
        return createChainMock({ data: null, error: { code: "PGRST116", message: "not found" } });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await approvalAdvancedHandler({
      event: {
        data: {
          offerId: OFFER_ID,
          organizationId: ORG_ID,
          decision: "approved",
          decidedBy: USER_ID,
        },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({ result: "auto_skipped_approver", requeued: true }),
    );
    expect(step.sendEvent).toHaveBeenCalledWith(
      "re-evaluate-chain",
      expect.objectContaining({
        name: "ats/offer.approval-decided",
      }),
    );
  });
});

// ── check-expiry ────────────────────────────────────────

describe("offerCheckExpiry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return early when no expired offers", async () => {
    mockFrom.mockImplementation(() =>
      createChainMock({ data: [], error: null }),
    );

    const step = createStepMock();
    const result = await checkExpiryHandler({ step });

    expect(result).toEqual(expect.objectContaining({ expired: 0 }));
  });

  it("should mark expired offers and notify recruiters", async () => {
    const expiredOffer = {
      id: "offer-exp-1",
      organization_id: ORG_ID,
      candidate_id: "cand-1",
      job_id: "job-1",
      created_by: USER_ID,
      esign_envelope_id: null,
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "offers") {
        const chain = createChainMock({ data: [expiredOffer], error: null });
        chain.update = vi.fn().mockReturnValue(
          createChainMock({ data: null, error: null }),
        );
        return chain;
      }
      if (table === "user_profiles") {
        return createChainMock({
          data: [{ id: USER_ID, email: "recruiter@test.com" }],
          error: null,
        });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await checkExpiryHandler({ step });

    expect(result).toEqual(expect.objectContaining({ expired: 1, notified: 1 }));
    expect(step.sendEvent).toHaveBeenCalledWith(
      "notify-expiry",
      expect.arrayContaining([
        expect.objectContaining({
          name: "ats/notification.requested",
        }),
      ]),
    );
  });

  it("should void e-sign envelopes for offers that have them", async () => {
    const expiredOffer = {
      id: "offer-exp-2",
      organization_id: ORG_ID,
      candidate_id: "cand-1",
      job_id: "job-1",
      created_by: USER_ID,
      esign_envelope_id: "env-123",
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "offers") {
        const chain = createChainMock({ data: [expiredOffer], error: null });
        chain.update = vi.fn().mockReturnValue(
          createChainMock({ data: null, error: null }),
        );
        return chain;
      }
      if (table === "user_profiles") {
        return createChainMock({
          data: [{ id: USER_ID, email: "recruiter@test.com" }],
          error: null,
        });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await checkExpiryHandler({ step });

    expect(result).toEqual(expect.objectContaining({ expired: 1 }));
    // Void step was called (stub logs only)
    expect(step.run).toHaveBeenCalledWith("void-esign-envelopes", expect.any(Function));
  });
});

// ── withdraw ────────────────────────────────────────────

describe("offerWithdraw", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should process withdrawal and notify recruiter", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offers") {
        return createChainMock({
          data: {
            id: OFFER_ID,
            candidate_id: "cand-1",
            job_id: "job-1",
            created_by: USER_ID,
            esign_envelope_id: null,
            esign_provider: null,
          },
          error: null,
        });
      }
      if (table === "candidates") {
        return createChainMock({ data: { full_name: "Alice" }, error: null });
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
    const result = await withdrawHandler({
      event: {
        data: { offerId: OFFER_ID, organizationId: ORG_ID, withdrawnBy: USER_ID },
      },
      step,
    });

    expect(result).toEqual(expect.objectContaining({ processed: true, esignVoided: false }));
    expect(step.sendEvent).toHaveBeenCalledWith(
      "notify-withdrawal",
      expect.objectContaining({
        name: "ats/notification.requested",
      }),
    );
  });

  it("should void e-sign envelope when present", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offers") {
        return createChainMock({
          data: {
            id: OFFER_ID,
            candidate_id: "cand-1",
            job_id: "job-1",
            created_by: USER_ID,
            esign_envelope_id: "env-123",
            esign_provider: "dropbox_sign",
          },
          error: null,
        });
      }
      if (table === "candidates") {
        return createChainMock({ data: { full_name: "Alice" }, error: null });
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
    const result = await withdrawHandler({
      event: {
        data: { offerId: OFFER_ID, organizationId: ORG_ID, withdrawnBy: USER_ID },
      },
      step,
    });

    expect(result).toEqual(expect.objectContaining({ processed: true, esignVoided: true }));
    expect(step.run).toHaveBeenCalledWith("void-esign-envelope", expect.any(Function));
  });

  it("should handle offer not found", async () => {
    mockFrom.mockImplementation(() =>
      createChainMock({ data: null, error: null }),
    );

    const step = createStepMock();
    const result = await withdrawHandler({
      event: {
        data: { offerId: OFFER_ID, organizationId: ORG_ID, withdrawnBy: USER_ID },
      },
      step,
    });

    expect(result).toEqual(expect.objectContaining({ processed: false, reason: "offer_not_found" }));
  });
});

// ── send-esign ──────────────────────────────────────────

vi.mock("@/lib/esign/dropbox-sign", () => ({
  createSignatureEnvelope: vi.fn().mockResolvedValue({
    signatureRequestId: "sign_mock_001",
    signingUrl: "https://app.hellosign.com/sign/mock",
  }),
  cancelSignatureEnvelope: vi.fn().mockResolvedValue(undefined),
  getDropboxSignClient: vi.fn(),
  verifyDropboxSignWebhook: vi.fn(),
  DROPBOX_SIGN_EVENT_MAP: {},
}));

vi.mock("@/lib/ai/generate", () => ({
  generateOfferLetterDraft: vi.fn().mockResolvedValue({ text: "AI generated letter content", error: undefined }),
}));

describe("offerSendEsign", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, DROPBOX_SIGN_TEMPLATE_ID: "tmpl_test_001" };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("should send offer via Dropbox Sign and update status to sent", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offers") {
        const chain = createChainMock({
          data: {
            id: OFFER_ID,
            candidate_id: "cand-1",
            job_id: "job-1",
            created_by: USER_ID,
            compensation: { base_salary: 150000, currency: "USD", period: "annual" },
            terms: null,
            esign_provider: "dropbox_sign",
            status: "approved",
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
        return createChainMock({ data: { title: "Engineer", department: "Eng" }, error: null });
      }
      if (table === "organizations") {
        return createChainMock({ data: { name: "TestOrg", plan: "pro", dropbox_sign_template_id: null }, error: null });
      }
      if (table === "user_profiles") {
        return createChainMock({ data: { email: "recruiter@test.com" }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await sendEsignHandler({
      event: {
        data: { offerId: OFFER_ID, organizationId: ORG_ID, requestedBy: USER_ID },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({
        sent: true,
        envelopeId: "sign_mock_001",
        candidateEmail: "alice@test.com",
        aiLetterGenerated: true,
      }),
    );
    expect(step.run).toHaveBeenCalledWith("create-esign-envelope", expect.any(Function));
    expect(step.run).toHaveBeenCalledWith("update-offer-sent", expect.any(Function));
    expect(step.sendEvent).toHaveBeenCalledWith(
      "notify-offer-sent",
      expect.objectContaining({
        name: "ats/notification.requested",
      }),
    );
  });

  it("should skip AI letter for growth plan", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offers") {
        const chain = createChainMock({
          data: {
            id: OFFER_ID,
            candidate_id: "cand-1",
            job_id: "job-1",
            created_by: USER_ID,
            compensation: { base_salary: 100000, currency: "USD", period: "annual" },
            terms: null,
            esign_provider: "dropbox_sign",
            status: "approved",
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
        return createChainMock({ data: { title: "Designer", department: null }, error: null });
      }
      if (table === "organizations") {
        return createChainMock({ data: { name: "GrowthOrg", plan: "growth", dropbox_sign_template_id: null }, error: null });
      }
      if (table === "user_profiles") {
        return createChainMock({ data: { email: "recruiter@test.com" }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await sendEsignHandler({
      event: {
        data: { offerId: OFFER_ID, organizationId: ORG_ID, requestedBy: USER_ID },
      },
      step,
    });

    expect(result).toEqual(
      expect.objectContaining({
        sent: true,
        aiLetterGenerated: false,
      }),
    );
  });

  it("should throw if offer is not in approved status", async () => {
    mockFrom.mockImplementation(() =>
      createChainMock({
        data: {
          id: OFFER_ID,
          status: "draft",
          candidate_id: "cand-1",
          job_id: "job-1",
          created_by: USER_ID,
        },
        error: null,
      }),
    );

    const step = createStepMock();

    await expect(
      sendEsignHandler({
        event: {
          data: { offerId: OFFER_ID, organizationId: ORG_ID, requestedBy: USER_ID },
        },
        step,
      }),
    ).rejects.toThrow("Offer must be approved to send");
  });

  it("should throw if candidate has no email", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "offers") {
        return createChainMock({
          data: {
            id: OFFER_ID,
            candidate_id: "cand-1",
            job_id: "job-1",
            created_by: USER_ID,
            compensation: {},
            terms: null,
            status: "approved",
          },
          error: null,
        });
      }
      if (table === "candidates") {
        return createChainMock({ data: { full_name: "NoEmail", email: null }, error: null });
      }
      if (table === "job_openings") {
        return createChainMock({ data: { title: "Role", department: null }, error: null });
      }
      if (table === "organizations") {
        return createChainMock({ data: { name: "Org", plan: "starter", dropbox_sign_template_id: null }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();

    await expect(
      sendEsignHandler({
        event: {
          data: { offerId: OFFER_ID, organizationId: ORG_ID, requestedBy: USER_ID },
        },
        step,
      }),
    ).rejects.toThrow("has no email");
  });
});
