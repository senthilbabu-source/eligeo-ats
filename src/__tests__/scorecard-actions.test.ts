import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────

const { mockFrom } = vi.hoisted(() => {
  return { mockFrom: vi.fn() };
});

function createChainMock(resolveValue: unknown = { data: null, error: null, count: 0 }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
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
    featureFlags: { ai_scorecard_summarize: true },
  }),
}));

vi.mock("@/lib/constants/roles", () => ({
  assertCan: vi.fn(),
  can: vi.fn().mockReturnValue(true),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/utils/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────

import {
  createScorecardTemplate,
  updateScorecardTemplate,
  deleteScorecardTemplate,
} from "@/lib/actions/scorecards";

// ── P1-3: Error propagation on template category/attribute failure ──

describe("createScorecardTemplate — error propagation (P1-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseInput = {
    name: "Test Template",
    description: "A test",
    isDefault: false,
    categories: [
      {
        name: "Technical",
        position: 0,
        weight: 2.0,
        attributes: [
          { name: "System Design", position: 0 },
          { name: "Coding", position: 1 },
        ],
      },
      {
        name: "Communication",
        position: 1,
        weight: 1.0,
        attributes: [
          { name: "Clarity", position: 0 },
        ],
      },
    ],
  };

  it("should succeed when all categories and attributes insert correctly", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // scorecard_templates insert
        return createChainMock({ data: { id: "tmpl-1" }, error: null });
      }
      if (callCount === 2) {
        // category 1 insert
        return createChainMock({ data: { id: "cat-1" }, error: null });
      }
      if (callCount === 3) {
        // category 1 attributes insert
        return createChainMock({ data: null, error: null });
      }
      if (callCount === 4) {
        // category 2 insert
        return createChainMock({ data: { id: "cat-2" }, error: null });
      }
      // category 2 attributes insert
      return createChainMock({ data: null, error: null });
    });

    const result = await createScorecardTemplate(baseInput);
    expect(result).toEqual({ success: true, id: "tmpl-1" });
  });

  it("should return error when a category insert fails", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // scorecard_templates insert — success
        return createChainMock({ data: { id: "tmpl-1" }, error: null });
      }
      if (callCount === 2) {
        // category 1 insert — FAIL
        return createChainMock({ data: null, error: { code: "42501", message: "permission denied" } });
      }
      if (callCount === 3) {
        // category 2 insert — success
        return createChainMock({ data: { id: "cat-2" }, error: null });
      }
      // category 2 attributes insert
      return createChainMock({ data: null, error: null });
    });

    const result = await createScorecardTemplate(baseInput);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("Technical");
    expect((result as { error: string }).error).toContain("failed to save categories");
  });

  it("should return error when attribute insert fails", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // scorecard_templates insert
        return createChainMock({ data: { id: "tmpl-1" }, error: null });
      }
      if (callCount === 2) {
        // category 1 insert — success
        return createChainMock({ data: { id: "cat-1" }, error: null });
      }
      if (callCount === 3) {
        // category 1 attributes — FAIL
        return createChainMock({ data: null, error: { code: "42501", message: "insert failed" } });
      }
      if (callCount === 4) {
        // category 2 insert — success
        return createChainMock({ data: { id: "cat-2" }, error: null });
      }
      // category 2 attributes — success
      return createChainMock({ data: null, error: null });
    });

    const result = await createScorecardTemplate(baseInput);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("Technical");
  });
});

describe("updateScorecardTemplate — error propagation (P1-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseInput = {
    templateId: "11111111-7003-4000-a000-000000000001",
    name: "Updated Template",
    categories: [
      {
        name: "Leadership",
        position: 0,
        weight: 1.5,
        attributes: [
          { name: "Decision Making", position: 0 },
        ],
      },
    ],
  };

  it("should succeed when all operations complete", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // template update
        return createChainMock({ data: null, error: null });
      }
      if (callCount === 2) {
        // fetch old categories
        return createChainMock({ data: [{ id: "old-cat-1" }], error: null });
      }
      if (callCount === 3) {
        // soft-delete old attributes
        return createChainMock({ data: null, error: null });
      }
      if (callCount === 4) {
        // soft-delete old categories
        return createChainMock({ data: null, error: null });
      }
      if (callCount === 5) {
        // new category insert
        return createChainMock({ data: { id: "new-cat-1" }, error: null });
      }
      // new attributes insert
      return createChainMock({ data: null, error: null });
    });

    const result = await updateScorecardTemplate(baseInput);
    expect(result).toEqual({ success: true, id: baseInput.templateId });
  });

  it("should return error when new category insert fails during update", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // template update — success
        return createChainMock({ data: null, error: null });
      }
      if (callCount === 2) {
        // fetch old categories — none
        return createChainMock({ data: [], error: null });
      }
      if (callCount === 3) {
        // new category insert — FAIL
        return createChainMock({ data: null, error: { code: "42501", message: "failed" } });
      }
      return createChainMock({ data: null, error: null });
    });

    const result = await updateScorecardTemplate(baseInput);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("Leadership");
    expect((result as { error: string }).error).toContain("failed to save categories");
  });

  it("should return error when new attribute insert fails during update", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // template update
        return createChainMock({ data: null, error: null });
      }
      if (callCount === 2) {
        // fetch old categories — none
        return createChainMock({ data: [], error: null });
      }
      if (callCount === 3) {
        // new category insert — success
        return createChainMock({ data: { id: "new-cat-1" }, error: null });
      }
      if (callCount === 4) {
        // new attributes insert — FAIL
        return createChainMock({ data: null, error: { code: "42501", message: "attr failed" } });
      }
      return createChainMock({ data: null, error: null });
    });

    const result = await updateScorecardTemplate(baseInput);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("Leadership");
  });
});

// ── P1-4: In-use guard on deleteScorecardTemplate ──────────

describe("deleteScorecardTemplate — in-use guard (P1-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const templateId = "11111111-7003-4000-a000-000000000001";

  it("should block deletion when active interviews reference the template", async () => {
    const interviewCountChain = createChainMock({ data: null, error: null, count: 3 });
    mockFrom.mockReturnValue(interviewCountChain);

    const result = await deleteScorecardTemplate(templateId);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("Cannot delete");
    expect((result as { error: string }).error).toContain("3 active interviews");
  });

  it("should block deletion with singular grammar for 1 interview", async () => {
    const interviewCountChain = createChainMock({ data: null, error: null, count: 1 });
    mockFrom.mockReturnValue(interviewCountChain);

    const result = await deleteScorecardTemplate(templateId);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("1 active interview");
    expect((result as { error: string }).error).not.toContain("interviews");
  });

  it("should allow deletion when no active interviews reference the template", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // interviews count = 0
        return createChainMock({ data: null, error: null, count: 0 });
      }
      if (callCount === 2) {
        // scorecard_templates soft-delete
        return createChainMock({ data: null, error: null });
      }
      if (callCount === 3) {
        // fetch categories for cascade delete
        return createChainMock({ data: [{ id: "cat-1" }], error: null });
      }
      if (callCount === 4) {
        // soft-delete attributes
        return createChainMock({ data: null, error: null });
      }
      // soft-delete categories
      return createChainMock({ data: null, error: null });
    });

    const result = await deleteScorecardTemplate(templateId);
    expect(result).toEqual({ success: true });
  });

  it("should return error when interview count query fails", async () => {
    const errorChain = createChainMock({ data: null, error: { code: "42501", message: "denied" }, count: null });
    mockFrom.mockReturnValue(errorChain);

    const result = await deleteScorecardTemplate(templateId);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("Failed to verify template usage");
  });
});
