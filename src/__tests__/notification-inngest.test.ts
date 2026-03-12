import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────

const { mockFrom, mockResendSend } = vi.hoisted(() => {
  return {
    mockFrom: vi.fn(),
    mockResendSend: vi.fn().mockResolvedValue({
      data: { id: "email_mock_id" },
      error: null,
    }),
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
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
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

vi.mock("resend", () => {
  function MockResend() {
    return { emails: { send: mockResendSend } };
  }
  return { Resend: MockResend };
});

// Mock extracts handler from createFunction — the export IS the handler
vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn(
      (_config: unknown, _trigger: unknown, handler: unknown) => handler,
    ),
  },
}));

// Import handlers — the mock makes createFunction return the handler directly
import { dispatchNotification } from "@/inngest/functions/notifications/dispatch";
import { sendEmailNotification } from "@/inngest/functions/notifications/send-email";
import { interviewReminder } from "@/inngest/functions/notifications/interview-reminder";

// ── Type helpers ────────────────────────────────────────
type StepMock = ReturnType<typeof createStepMock>;
type EventCtx = { event: { data: Record<string, unknown> }; step: StepMock };
type CronCtx = { step: StepMock };

const dispatchHandler = dispatchNotification as unknown as (ctx: EventCtx) => Promise<unknown>;
const sendEmailHandler = sendEmailNotification as unknown as (ctx: EventCtx) => Promise<unknown>;
const reminderHandler = interviewReminder as unknown as (ctx: CronCtx) => Promise<unknown>;

// ── Tests ───────────────────────────────────────────────

describe("dispatchNotification", () => {
  const baseEvent = {
    data: {
      organizationId: "org-001",
      userId: "user-001",
      eventType: "application.new",
      recipientEmail: "test@example.com",
      templateId: "tpl-001",
      variables: { candidate: { name: "Alice" } },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should dispatch email when preference is 'email'", async () => {
    const chain = createChainMock({ data: { channel: "email" }, error: null });
    mockFrom.mockReturnValue(chain);

    const step = createStepMock();
    const result = await dispatchHandler({ event: baseEvent, step });

    expect(result).toEqual(
      expect.objectContaining({ dispatched: true, channel: "email", email: true }),
    );
    expect(step.sendEvent).toHaveBeenCalledWith("dispatch-email", {
      name: "ats/notification.send-email",
      data: expect.objectContaining({
        recipientEmail: "test@example.com",
        templateId: "tpl-001",
      }),
    });
  });

  it("should suppress when preference is 'none'", async () => {
    const chain = createChainMock({ data: { channel: "none" }, error: null });
    mockFrom.mockReturnValue(chain);

    const step = createStepMock();
    const result = await dispatchHandler({ event: baseEvent, step });

    expect(result).toEqual({ dispatched: false, reason: "suppressed" });
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it("should dispatch both channels when preference is 'both'", async () => {
    const chain = createChainMock({ data: { channel: "both" }, error: null });
    mockFrom.mockReturnValue(chain);

    const step = createStepMock();
    const result = await dispatchHandler({ event: baseEvent, step });

    expect(result).toEqual(
      expect.objectContaining({
        dispatched: true,
        channel: "both",
        inApp: true,
        email: true,
      }),
    );
    expect(step.sendEvent).toHaveBeenCalled();
  });

  it("should default to email when no preference exists", async () => {
    const chain = createChainMock({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const step = createStepMock();
    const result = await dispatchHandler({ event: baseEvent, step });

    expect(result).toEqual(
      expect.objectContaining({ dispatched: true, channel: "email", email: true }),
    );
  });
});

describe("sendEmailNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render template and send email", async () => {
    const chain = createChainMock({
      data: {
        subject: "Interview for {{job.title}}",
        body_html: "<p>Hi {{candidate.name}}</p>",
        body_text: "Hi {{candidate.name}}",
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const step = createStepMock();
    const result = await sendEmailHandler({
      event: {
        data: {
          organizationId: "org-001",
          userId: "user-001",
          recipientEmail: "alice@example.com",
          templateId: "tpl-001",
          variables: {
            candidate: { name: "Alice" },
            job: { title: "Engineer" },
          },
          eventType: "interview.invite",
        },
      },
      step,
    });

    expect(result).toEqual(expect.objectContaining({ sent: true }));
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: "Interview for Engineer",
      }),
    );
  });

  it("should send fallback email when no templateId provided", async () => {
    const step = createStepMock();
    const result = await sendEmailHandler({
      event: {
        data: {
          organizationId: "org-001",
          userId: "user-001",
          recipientEmail: "bob@example.com",
          variables: {},
          eventType: "stage.changed",
        },
      },
      step,
    });

    expect(result).toEqual(expect.objectContaining({ sent: true }));
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "bob@example.com",
        subject: "Notification: stage.changed",
      }),
    );
  });

  it("should throw when template not found", async () => {
    const chain = createChainMock({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const step = createStepMock();

    await expect(
      sendEmailHandler({
        event: {
          data: {
            organizationId: "org-001",
            userId: "user-001",
            recipientEmail: "test@example.com",
            templateId: "nonexistent",
            variables: {},
            eventType: "test",
          },
        },
        step,
      }),
    ).rejects.toThrow("Template nonexistent not found");
  });
});

describe("interviewReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return zero reminders when no interviews in window", async () => {
    const chain = createChainMock({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const step = createStepMock();
    const result = await reminderHandler({ step });

    expect(result).toEqual({
      reminders: 0,
      message: "No interviews in reminder windows",
    });
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it("should dispatch reminders for interviews in 24h window", async () => {
    const futureTime = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString();

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainMock({
          data: [
            {
              id: "int-001",
              organization_id: "org-001",
              application_id: "app-001",
              interviewer_id: "user-001",
              scheduled_start: futureTime,
              location: "Zoom",
            },
          ],
          error: null,
        });
      }
      if (callCount === 2) {
        return createChainMock({ data: [], error: null });
      }
      return createChainMock({
        data: [{ id: "user-001", email: "interviewer@example.com" }],
      });
    });

    const step = createStepMock();
    const result = await reminderHandler({ step });

    expect(result).toEqual(expect.objectContaining({ reminders: 1 }));
    expect(step.sendEvent).toHaveBeenCalledWith(
      "send-reminders",
      expect.arrayContaining([
        expect.objectContaining({
          name: "ats/notification.requested",
          data: expect.objectContaining({
            eventType: "interview.reminder.24h",
            recipientEmail: "interviewer@example.com",
          }),
        }),
      ]),
    );
  });
});
