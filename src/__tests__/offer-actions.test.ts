import { describe, it, expect, vi, beforeEach } from "vitest";
import { TENANT_A } from "@/__fixtures__/golden-tenant";

// ── Mocks ──────────────────────────────────────────────────

const { mockFrom } = vi.hoisted(() => {
  return { mockFrom: vi.fn() };
});

function createChainMock(resolveValue: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolveValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveValue);
  chain.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) =>
    resolve(resolveValue),
  );
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({ from: mockFrom }),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    userId: TENANT_A.users.owner.id,
    orgId: TENANT_A.org.id,
    orgRole: "owner",
    plan: "pro",
    featureFlags: {},
  }),
}));

vi.mock("@/lib/constants/roles", () => ({
  assertCan: vi.fn(),
  can: vi.fn().mockReturnValue(true),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/utils/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

// ── Helpers ────────────────────────────────────────────────

const validCreateInput = {
  applicationId: TENANT_A.applications.aliceForEngineer.id,
  compensation: {
    base_salary: 120000,
    currency: "USD" as const,
    period: "annual" as const,
  },
  approvers: [
    { userId: TENANT_A.users.hiringManager.id, sequenceOrder: 1 },
  ],
};

// ── createOffer ────────────────────────────────────────────

describe("createOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create offer with valid input", async () => {
    // Application lookup
    const appChain = createChainMock({
      data: {
        id: TENANT_A.applications.aliceForEngineer.id,
        candidate_id: TENANT_A.candidates.alice.id,
        job_opening_id: TENANT_A.jobs.seniorEngineer.id,
      },
      error: null,
    });
    // Offer insert
    const offerChain = createChainMock({
      data: { id: "new-offer-id" },
      error: null,
    });
    // Approvals insert
    const approvalChain = createChainMock({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return appChain; // applications
      if (callCount === 2) return offerChain; // offers insert
      return approvalChain; // offer_approvals insert
    });

    const { createOffer } = await import("@/lib/actions/offers");
    const result = await createOffer(validCreateInput);

    expect(result).toEqual({ success: true, id: "new-offer-id" });
  });

  it("should reject invalid compensation currency", async () => {
    const { createOffer } = await import("@/lib/actions/offers");
    const result = await createOffer({
      ...validCreateInput,
      compensation: { base_salary: 100000, currency: "XYZ" as never, period: "annual" },
    });

    expect(result).toEqual({ error: "Invalid input. Check all required fields." });
  });

  it("should reject zero base_salary", async () => {
    const { createOffer } = await import("@/lib/actions/offers");
    const result = await createOffer({
      ...validCreateInput,
      compensation: { base_salary: 0, currency: "USD", period: "annual" },
    });

    expect(result).toEqual({ error: "Invalid input. Check all required fields." });
  });

  it("should reject empty approvers array", async () => {
    const { createOffer } = await import("@/lib/actions/offers");
    const result = await createOffer({
      ...validCreateInput,
      approvers: [],
    });

    expect(result).toEqual({ error: "Invalid input. Check all required fields." });
  });

  it("should return error when application not found", async () => {
    const appChain = createChainMock({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValue(appChain);

    const { createOffer } = await import("@/lib/actions/offers");
    const result = await createOffer(validCreateInput);

    expect(result).toEqual({ error: "Application not found." });
  });
});

// ── updateOffer ────────────────────────────────────────────

describe("updateOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update draft offer compensation", async () => {
    // Fetch existing
    const fetchChain = createChainMock({
      data: { id: TENANT_A.offers.aliceDraft.id, status: "draft" },
      error: null,
    });
    // Update
    const updateChain = createChainMock({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return fetchChain;
      return updateChain;
    });

    const { updateOffer } = await import("@/lib/actions/offers");
    const result = await updateOffer({
      id: TENANT_A.offers.aliceDraft.id,
      compensation: { base_salary: 130000, currency: "USD", period: "annual" },
    });

    expect(result).toEqual({ success: true });
  });

  it("should reject update on non-draft offer", async () => {
    const fetchChain = createChainMock({
      data: { id: TENANT_A.offers.aliceDraft.id, status: "pending_approval" },
      error: null,
    });
    mockFrom.mockReturnValue(fetchChain);

    const { updateOffer } = await import("@/lib/actions/offers");
    const result = await updateOffer({
      id: TENANT_A.offers.aliceDraft.id,
      compensation: { base_salary: 130000, currency: "USD", period: "annual" },
    });

    expect(result).toEqual({ error: "Only draft offers can be edited." });
  });

  it("should reject update with no changes", async () => {
    const fetchChain = createChainMock({
      data: { id: TENANT_A.offers.aliceDraft.id, status: "draft" },
      error: null,
    });
    mockFrom.mockReturnValue(fetchChain);

    const { updateOffer } = await import("@/lib/actions/offers");
    const result = await updateOffer({ id: TENANT_A.offers.aliceDraft.id });

    expect(result).toEqual({ error: "No changes provided." });
  });
});

// ── submitForApproval ──────────────────────────────────────

describe("submitForApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should submit draft offer for approval", async () => {
    // Fetch offer
    const offerChain = createChainMock({
      data: { id: TENANT_A.offers.aliceDraft.id, status: "draft" },
      error: null,
    });
    // buildTransitionContext: offer query
    const ctxOfferChain = createChainMock({
      data: {
        compensation: { base_salary: 120000 },
        esign_provider: "dropbox_sign",
        expiry_date: "2027-01-01",
      },
      error: null,
    });
    // buildTransitionContext: approvals query
    const ctxApprovalsChain = createChainMock({
      data: [{ status: "pending" }],
      error: null,
    });
    // Override chain.then for approvals (returns array not single)
    ctxApprovalsChain.then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => void) =>
        resolve({ data: [{ status: "pending" }], error: null }),
    );
    // Update offer status
    const updateChain = createChainMock({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return offerChain;       // fetch offer
      if (callCount === 2) return ctxOfferChain;     // buildTransitionContext: offers
      if (callCount === 3) return ctxApprovalsChain; // buildTransitionContext: approvals
      return updateChain;                             // update status
    });

    const { submitForApproval } = await import("@/lib/actions/offers");
    const result = await submitForApproval(TENANT_A.offers.aliceDraft.id);

    expect(result).toEqual({ success: true });
  });

  it("should reject submission from non-draft status", async () => {
    const offerChain = createChainMock({
      data: { id: TENANT_A.offers.aliceDraft.id, status: "approved" },
      error: null,
    });
    // Context queries
    const ctxOfferChain = createChainMock({
      data: { compensation: { base_salary: 120000 }, esign_provider: null, expiry_date: null },
      error: null,
    });
    const ctxApprovalsChain = createChainMock({ data: [], error: null });
    ctxApprovalsChain.then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => void) =>
        resolve({ data: [], error: null }),
    );

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return offerChain;
      if (callCount === 2) return ctxOfferChain;
      return ctxApprovalsChain;
    });

    const { submitForApproval } = await import("@/lib/actions/offers");
    const result = await submitForApproval(TENANT_A.offers.aliceDraft.id);

    expect(result.error).toBeDefined();
  });
});

// ── withdrawOffer ──────────────────────────────────────────

describe("withdrawOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should withdraw a draft offer", async () => {
    const offerChain = createChainMock({
      data: { id: TENANT_A.offers.aliceDraft.id, status: "draft", esign_envelope_id: null },
      error: null,
    });
    const ctxOfferChain = createChainMock({
      data: { compensation: { base_salary: 120000 }, esign_provider: null, expiry_date: null },
      error: null,
    });
    const ctxApprovalsChain = createChainMock({ data: [], error: null });
    ctxApprovalsChain.then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => void) =>
        resolve({ data: [], error: null }),
    );
    const updateChain = createChainMock({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return offerChain;
      if (callCount === 2) return ctxOfferChain;
      if (callCount === 3) return ctxApprovalsChain;
      return updateChain;
    });

    const { withdrawOffer } = await import("@/lib/actions/offers");
    const result = await withdrawOffer(TENANT_A.offers.aliceDraft.id);

    expect(result).toEqual({ success: true });
  });

  it("should reject withdraw from signed offer", async () => {
    const offerChain = createChainMock({
      data: { id: "some-id", status: "signed", esign_envelope_id: "env-123" },
      error: null,
    });
    const ctxOfferChain = createChainMock({
      data: { compensation: { base_salary: 120000 }, esign_provider: "dropbox_sign", expiry_date: null },
      error: null,
    });
    const ctxApprovalsChain = createChainMock({ data: [], error: null });
    ctxApprovalsChain.then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => void) =>
        resolve({ data: [], error: null }),
    );

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return offerChain;
      if (callCount === 2) return ctxOfferChain;
      return ctxApprovalsChain;
    });

    const { withdrawOffer } = await import("@/lib/actions/offers");
    const result = await withdrawOffer("some-id");

    expect(result.error).toBeDefined();
  });
});

// ── rejectOffer ────────────────────────────────────────────

describe("rejectOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require rejection notes", async () => {
    const { rejectOffer } = await import("@/lib/actions/offers");
    const result = await rejectOffer(TENANT_A.offers.aliceDraft.id, "");

    expect(result).toEqual({ error: "Rejection notes are required." });
  });

  it("should reject offer not in pending_approval", async () => {
    const offerChain = createChainMock({
      data: { id: TENANT_A.offers.aliceDraft.id, status: "draft" },
      error: null,
    });
    mockFrom.mockReturnValue(offerChain);

    const { rejectOffer } = await import("@/lib/actions/offers");
    const result = await rejectOffer(
      TENANT_A.offers.aliceDraft.id,
      "Compensation too low",
    );

    expect(result).toEqual({ error: "Offer is not pending approval." });
  });
});

// ── markOfferSigned ────────────────────────────────────────

describe("markOfferSigned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should mark approved offer as signed (manual fallback)", async () => {
    const offerChain = createChainMock({
      data: { id: "offer-1", status: "approved" },
      error: null,
    });
    const updateChain = createChainMock({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return offerChain;
      return updateChain;
    });

    const { markOfferSigned } = await import("@/lib/actions/offers");
    const result = await markOfferSigned("offer-1");

    expect(result).toEqual({ success: true });
  });

  it("should reject marking draft offer as signed", async () => {
    const offerChain = createChainMock({
      data: { id: "offer-1", status: "draft" },
      error: null,
    });
    mockFrom.mockReturnValue(offerChain);

    const { markOfferSigned } = await import("@/lib/actions/offers");
    const result = await markOfferSigned("offer-1");

    expect(result).toEqual({
      error: "Offer must be approved or sent to mark as signed.",
    });
  });
});

// ── listOffers ─────────────────────────────────────────────

describe("listOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return offers for the org", async () => {
    const offers = [
      { id: TENANT_A.offers.aliceDraft.id, status: "draft" },
    ];
    const chain = createChainMock({ data: offers, error: null });
    // Override: listOffers does NOT call .single(), it awaits the chain directly
    chain.then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => void) =>
        resolve({ data: offers, error: null }),
    );
    mockFrom.mockReturnValue(chain);

    const { listOffers } = await import("@/lib/actions/offers");
    const result = await listOffers();

    expect(result).toEqual({ success: true, data: offers });
  });
});

// ── getOffer ───────────────────────────────────────────────

describe("getOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return offer with approvals", async () => {
    const offerData = {
      id: TENANT_A.offers.aliceDraft.id,
      status: "draft",
      compensation: { base_salary: 120000, currency: "USD", period: "annual" },
    };
    const approvals = [
      {
        id: TENANT_A.offerApprovals.aliceApprovalHM.id,
        approver_id: TENANT_A.users.hiringManager.id,
        sequence_order: 1,
        status: "pending",
        decided_at: null,
        notes: null,
      },
    ];
    const offerChain = createChainMock({ data: offerData, error: null });
    const approvalChain = createChainMock({ data: approvals, error: null });
    approvalChain.then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => void) =>
        resolve({ data: approvals, error: null }),
    );

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return offerChain;
      return approvalChain;
    });

    const { getOffer } = await import("@/lib/actions/offers");
    const result = await getOffer(TENANT_A.offers.aliceDraft.id);

    expect(result.success).toBe(true);
    expect(result.data?.approvals).toHaveLength(1);
  });

  it("should return error for non-existent offer", async () => {
    const chain = createChainMock({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValue(chain);

    const { getOffer } = await import("@/lib/actions/offers");
    const result = await getOffer("nonexistent-id");

    expect(result).toEqual({ error: "Offer not found." });
  });
});
