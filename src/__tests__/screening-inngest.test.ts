import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────

const { mockFrom, mockInngestSend } = vi.hoisted(() => {
  return {
    mockFrom: vi.fn(),
    mockInngestSend: vi.fn().mockResolvedValue(undefined),
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
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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
    send: mockInngestSend,
  },
}));

vi.mock("@/lib/utils/candidate-token", () => ({
  createScreeningToken: vi.fn(() => "mock-screening-token"),
}));

vi.mock("@/lib/ai/screening", () => ({
  generateScreeningSummary: vi.fn(),
}));

import { screeningInviteCandidate } from "@/inngest/functions/screening/invite-candidate";
import { screeningGenerateSummary } from "@/inngest/functions/screening/generate-summary";
import { screeningSendReminder } from "@/inngest/functions/screening/send-reminder";
import { generateScreeningSummary } from "@/lib/ai/screening";

// ── Type helpers ────────────────────────────────────────
type StepMock = ReturnType<typeof createStepMock>;
type EventCtx = { event: { data: Record<string, unknown> }; step: StepMock };

const inviteHandler = screeningInviteCandidate as unknown as (ctx: EventCtx) => Promise<unknown>;
const summaryHandler = screeningGenerateSummary as unknown as (ctx: EventCtx) => Promise<unknown>;
const reminderHandler = screeningSendReminder as unknown as (ctx: EventCtx) => Promise<unknown>;

const ORG_ID = "org-test-123";
const APP_ID = "app-test-456";
const SESSION_ID = "session-test-789";
const CANDIDATE_ID = "candidate-test-101";
const STAGE_ID = "stage-test-201";
const CONFIG_ID = "config-test-301";
const JOB_ID = "job-test-401";

// ── screeningInviteCandidate ───────────────────────────

describe("P6-4: screeningInviteCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should skip when no screening config for stage", async () => {
    // Application found but no screening config
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // applications lookup
        return createChainMock({ data: { candidate_id: CANDIDATE_ID, job_opening_id: JOB_ID }, error: null });
      }
      if (callCount === 2) {
        // screening_configs lookup — none found
        return createChainMock({ data: null, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await inviteHandler({
      event: { data: { applicationId: APP_ID, organizationId: ORG_ID, stageId: STAGE_ID } },
      step,
    });

    expect(result).toEqual({ skipped: true });
  });

  it("should skip when session already exists (dedup)", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // application
        return createChainMock({ data: { candidate_id: CANDIDATE_ID, job_opening_id: JOB_ID }, error: null });
      }
      if (callCount === 2) {
        // screening config found
        return createChainMock({ data: { id: CONFIG_ID, questions: [] }, error: null });
      }
      if (callCount === 3) {
        // stage name with "screening"
        return createChainMock({ data: { name: "AI Screening" }, error: null });
      }
      if (callCount === 4) {
        // existing session found
        return createChainMock({ data: { id: "existing-session", status: "pending" }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await inviteHandler({
      event: { data: { applicationId: APP_ID, organizationId: ORG_ID, stageId: STAGE_ID } },
      step,
    });

    expect(result).toEqual({ skipped: true, existingSessionId: "existing-session" });
  });

  it("should create session and send invite when config exists", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainMock({ data: { candidate_id: CANDIDATE_ID, job_opening_id: JOB_ID }, error: null });
      }
      if (callCount === 2) {
        return createChainMock({ data: { id: CONFIG_ID, questions: [] }, error: null });
      }
      if (callCount === 3) {
        return createChainMock({ data: { name: "AI Screening" }, error: null });
      }
      if (callCount === 4) {
        // No existing session
        return createChainMock({ data: null, error: null });
      }
      if (callCount === 5) {
        // Insert session
        return createChainMock({ data: { id: SESSION_ID }, error: null });
      }
      if (callCount === 6) {
        // Candidate email
        return createChainMock({ data: { email: "alice@example.com", first_name: "Alice" }, error: null });
      }
      if (callCount === 7) {
        // Job
        return createChainMock({ data: { title: "Senior Engineer", slug: "senior-engineer" }, error: null });
      }
      if (callCount === 8) {
        // Org
        return createChainMock({ data: { name: "itecbrains", slug: "itecbrains" }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await inviteHandler({
      event: { data: { applicationId: APP_ID, organizationId: ORG_ID, stageId: STAGE_ID } },
      step,
    });

    expect(result).toEqual({ sessionId: SESSION_ID });
    // Should schedule a 48h reminder
    expect(step.sendEvent).toHaveBeenCalledWith(
      "schedule-reminder",
      expect.objectContaining({
        name: "ats/screening.reminder-due",
        data: expect.objectContaining({ sessionId: SESSION_ID }),
      }),
    );
  });
});

// ── screeningGenerateSummary ───────────────────────────

describe("P6-4: screeningGenerateSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate summary and update session to completed", async () => {
    // Load session
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Session with config
        return createChainMock({
          data: {
            id: SESSION_ID,
            turns: [{ id: "t1", question_id: "q1", ai_question_text: "Q?", candidate_answer: "A." }],
            screening_configs: { questions: [{ id: "q1", topic: "Tech", raw_question: "Q?" }], job_opening_id: JOB_ID },
          },
          error: null,
        });
      }
      if (callCount === 2) {
        // Job title
        return createChainMock({ data: { title: "Senior Engineer" }, error: null });
      }
      // Update session
      return createChainMock({ data: null, error: null });
    });

    vi.mocked(generateScreeningSummary).mockResolvedValue({
      summary: "Strong candidate.",
      overallScore: 0.85,
      scoreBreakdown: { q1: 0.85 },
      keySignals: ["good technical depth"],
    });

    const step = createStepMock();
    const result = await summaryHandler({
      event: { data: { sessionId: SESSION_ID, organizationId: ORG_ID } },
      step,
    });

    expect(result).toEqual({
      sessionId: SESSION_ID,
      score: 0.85,
      signalCount: 1,
    });
    expect(generateScreeningSummary).toHaveBeenCalledOnce();
  });

  it("should handle summary generation error gracefully", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainMock({
          data: {
            id: SESSION_ID,
            turns: [],
            screening_configs: { questions: [], job_opening_id: JOB_ID },
          },
          error: null,
        });
      }
      if (callCount === 2) {
        return createChainMock({ data: { title: "Engineer" }, error: null });
      }
      return createChainMock({ data: null, error: null });
    });

    vi.mocked(generateScreeningSummary).mockResolvedValue({
      summary: "",
      overallScore: 0,
      scoreBreakdown: {},
      keySignals: [],
      error: "Insufficient AI credits",
    });

    const step = createStepMock();
    const result = await summaryHandler({
      event: { data: { sessionId: SESSION_ID, organizationId: ORG_ID } },
      step,
    });

    expect(result).toEqual({
      sessionId: SESSION_ID,
      score: 0,
      signalCount: 0,
    });
  });
});

// ── screeningSendReminder ──────────────────────────────

describe("P6-4: screeningSendReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send reminder when session is still pending", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Session still pending
        return createChainMock({ data: { status: "pending" }, error: null });
      }
      if (callCount === 2) {
        // Candidate email
        return createChainMock({ data: { email: "bob@example.com", first_name: "Bob" }, error: null });
      }
      return createChainMock();
    });

    const step = createStepMock();
    const result = await reminderHandler({
      event: { data: { sessionId: SESSION_ID, organizationId: ORG_ID, candidateId: CANDIDATE_ID } },
      step,
    });

    expect(result).toEqual({ reminded: true });
  });

  it("should skip reminder when session is no longer pending", async () => {
    mockFrom.mockImplementation(() =>
      createChainMock({ data: { status: "completed" }, error: null }),
    );

    const step = createStepMock();
    const result = await reminderHandler({
      event: { data: { sessionId: SESSION_ID, organizationId: ORG_ID, candidateId: CANDIDATE_ID } },
      step,
    });

    expect(result).toEqual({ skipped: true });
  });

  it("should skip when session is in_progress (not pending)", async () => {
    mockFrom.mockImplementation(() =>
      createChainMock({ data: { status: "in_progress" }, error: null }),
    );

    const step = createStepMock();
    const result = await reminderHandler({
      event: { data: { sessionId: SESSION_ID, organizationId: ORG_ID, candidateId: CANDIDATE_ID } },
      step,
    });

    expect(result).toEqual({ skipped: true });
  });
});
