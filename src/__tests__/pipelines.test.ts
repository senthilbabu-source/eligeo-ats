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
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
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
  }),
}));

vi.mock("@/lib/constants/roles", () => ({
  assertCan: vi.fn(), // Always passes
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
  createPipelineTemplate,
  deletePipelineTemplate,
  addStage,
  removeStage,
  reorderStages,
} from "@/lib/actions/pipelines";

// ── Tests ──────────────────────────────────────────────────

describe("createPipelineTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject invalid input (empty name)", async () => {
    const formData = new FormData();
    formData.set("name", "");

    const result = await createPipelineTemplate(null, formData);
    expect(result).toEqual({ error: "Invalid input. Please check all fields." });
  });

  it("should create a template and set as default if first", async () => {
    const countChain = createChainMock({ data: null, error: null, count: 0 });
    const insertChain = createChainMock({
      data: { id: "new-template-id" },
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countChain : insertChain;
    });

    const formData = new FormData();
    formData.set("name", "Engineering Pipeline");
    formData.set("description", "For engineering roles");

    const result = await createPipelineTemplate(null, formData);
    expect(result).toEqual({ success: true, id: "new-template-id" });
  });

  it("should return error on duplicate name", async () => {
    const countChain = createChainMock({ data: null, error: null, count: 1 });
    const insertChain = createChainMock({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? countChain : insertChain;
    });

    const formData = new FormData();
    formData.set("name", "Existing Pipeline");

    const result = await createPipelineTemplate(null, formData);
    expect(result).toEqual({
      error: "A pipeline template with this name already exists",
    });
  });
});

describe("deletePipelineTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should prevent deletion when active jobs reference it", async () => {
    const jobCountChain = createChainMock({ data: null, error: null, count: 3 });
    mockFrom.mockReturnValue(jobCountChain);

    const result = await deletePipelineTemplate("some-template-id");
    expect(result).toEqual({
      error: "Cannot delete: 3 active job(s) use this pipeline template",
    });
  });

  it("should soft-delete when no active jobs", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // job_openings count = 0
        return createChainMock({ data: null, error: null, count: 0 });
      }
      // pipeline_templates update (soft delete)
      return createChainMock({ data: null, error: null });
    });

    const result = await deletePipelineTemplate("some-template-id");
    expect(result).toEqual({ success: true });
  });
});

describe("addStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject invalid input (empty name)", async () => {
    const formData = new FormData();
    formData.set("pipelineTemplateId", "11111111-6001-4000-a000-000000000001");
    formData.set("name", "");
    formData.set("stageType", "interview");

    const result = await addStage(null, formData);
    expect(result).toEqual({ error: "Invalid input. Please check all fields." });
  });

  it("should reject invalid stage type", async () => {
    const formData = new FormData();
    formData.set("pipelineTemplateId", "11111111-6001-4000-a000-000000000001");
    formData.set("name", "Bad Stage");
    formData.set("stageType", "invalid_type");

    const result = await addStage(null, formData);
    expect(result).toEqual({ error: "Invalid input. Please check all fields." });
  });

  it("should add stage at next order position", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Get max stage_order = 5
        return createChainMock({ data: [{ stage_order: 5 }], error: null });
      }
      // Insert new stage
      return createChainMock({ data: { id: "new-stage-id" }, error: null });
    });

    const formData = new FormData();
    formData.set("pipelineTemplateId", "11111111-6001-4000-a000-000000000001");
    formData.set("name", "Phone Screen");
    formData.set("stageType", "screening");

    const result = await addStage(null, formData);
    expect(result).toEqual({ success: true, id: "new-stage-id" });
  });
});

describe("removeStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should prevent removal when active applications in stage", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Fetch stage info
        return createChainMock({
          data: { pipeline_template_id: "tpl-1" },
          error: null,
        });
      }
      // Application count = 2
      return createChainMock({ data: null, error: null, count: 2 });
    });

    const result = await removeStage("stage-with-apps");
    expect(result).toEqual({
      error: "Cannot remove: 2 active application(s) in this stage. Move them first.",
    });
  });
});

describe("reorderStages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject empty stage list", async () => {
    const result = await reorderStages("some-template", []);
    expect(result).toEqual({ error: "Invalid input" });
  });

  it("should update stage_order for each stage", async () => {
    mockFrom.mockReturnValue(createChainMock({ data: null, error: null }));

    const stageIds = [
      "11111111-6002-4000-a000-000000000003",
      "11111111-6002-4000-a000-000000000001",
      "11111111-6002-4000-a000-000000000002",
    ];

    const result = await reorderStages(
      "11111111-6001-4000-a000-000000000001",
      stageIds,
    );
    expect(result).toEqual({ success: true });
  });
});
