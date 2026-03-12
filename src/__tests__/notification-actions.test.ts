import { describe, it, expect, vi, beforeEach } from "vitest";

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
  chain.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) => resolve(resolveValue));
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({ from: mockFrom }),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    userId: "11111111-1001-4000-a000-000000000001",
    orgId: "11111111-2001-4000-a000-000000000001",
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

// ── Tests ──────────────────────────────────────────────────

describe("createEmailTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create template with valid input", async () => {
    const chain = createChainMock({
      data: { id: "new-template-id" },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const { createEmailTemplate } = await import(
      "@/lib/actions/notifications"
    );

    const result = await createEmailTemplate({
      name: "Test Template",
      subject: "Test Subject",
      body_html: "<p>Hello</p>",
      category: "custom",
    });

    expect(result.data).toEqual({ id: "new-template-id" });
    expect(result.error).toBeUndefined();
    expect(mockFrom).toHaveBeenCalledWith("email_templates");
  });

  it("should reject invalid category", async () => {
    const { createEmailTemplate } = await import(
      "@/lib/actions/notifications"
    );

    const result = await createEmailTemplate({
      name: "Test",
      subject: "Test",
      body_html: "<p>Test</p>",
      category: "invalid_category",
    });

    expect(result.error).toBeDefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("should reject empty name", async () => {
    const { createEmailTemplate } = await import(
      "@/lib/actions/notifications"
    );

    const result = await createEmailTemplate({
      name: "",
      subject: "Test",
      body_html: "<p>Test</p>",
      category: "custom",
    });

    expect(result.error).toBeDefined();
  });
});

describe("deleteEmailTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should soft-delete non-system template", async () => {
    // First call: select to check is_system
    const selectChain = createChainMock({
      data: { id: "template-id", is_system: false },
      error: null,
    });
    // Second call: update for soft delete
    const updateChain = createChainMock({ data: null, error: null });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? selectChain : updateChain;
    });

    const { deleteEmailTemplate } = await import(
      "@/lib/actions/notifications"
    );

    const result = await deleteEmailTemplate("template-id");

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should block deletion of system template", async () => {
    const chain = createChainMock({
      data: { id: "system-template-id", is_system: true },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const { deleteEmailTemplate } = await import(
      "@/lib/actions/notifications"
    );

    const result = await deleteEmailTemplate("system-template-id");

    expect(result.error).toBe("System templates cannot be deleted.");
  });

  it("should return error when template not found", async () => {
    const chain = createChainMock({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const { deleteEmailTemplate } = await import(
      "@/lib/actions/notifications"
    );

    const result = await deleteEmailTemplate("nonexistent-id");

    expect(result.error).toBe("Template not found.");
  });
});

describe("updateEmailTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update template with valid fields", async () => {
    const chain = createChainMock({
      data: { id: "template-id" },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const { updateEmailTemplate } = await import(
      "@/lib/actions/notifications"
    );

    const result = await updateEmailTemplate({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Updated Name",
    });

    expect(result.data).toEqual({ id: "template-id" });
    expect(result.error).toBeUndefined();
  });

  it("should reject when no fields to update", async () => {
    const { updateEmailTemplate } = await import(
      "@/lib/actions/notifications"
    );

    const result = await updateEmailTemplate({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.error).toBe("No fields to update.");
  });
});

describe("previewEmailTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render template with provided variables", async () => {
    const chain = createChainMock({
      data: {
        subject: "Interview for {{job.title}}",
        body_html: "<p>Hi {{candidate.name}}</p>",
        body_text: "Hi {{candidate.name}}",
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const { previewEmailTemplate } = await import(
      "@/lib/actions/notifications"
    );

    const result = await previewEmailTemplate({
      templateId: "550e8400-e29b-41d4-a716-446655440000",
      variables: {
        candidate: { name: "Alice" },
        job: { title: "Engineer" },
      },
    });

    expect(result.data?.subject).toBe("Interview for Engineer");
    expect(result.data?.body_html).toBe("<p>Hi Alice</p>");
    expect(result.data?.body_text).toBe("Hi Alice");
  });
});

describe("setNotificationPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should upsert preference with valid input", async () => {
    const chain = createChainMock({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const { setNotificationPreference } = await import(
      "@/lib/actions/notifications"
    );

    const result = await setNotificationPreference({
      event_type: "application.new",
      channel: "email",
    });

    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("notification_preferences");
  });

  it("should reject invalid channel value", async () => {
    const { setNotificationPreference } = await import(
      "@/lib/actions/notifications"
    );

    const result = await setNotificationPreference({
      event_type: "application.new",
      channel: "invalid_channel" as "email",
    });

    expect(result.error).toBeDefined();
  });
});
