import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────

const { mockFrom, mockGenerateAndStore } = vi.hoisted(() => {
  return {
    mockFrom: vi.fn(),
    mockGenerateAndStore: vi.fn(),
  };
});

function createChainMock(resolveValue: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolveValue);
  chain.then = vi
    .fn()
    .mockImplementation((resolve: (v: unknown) => void) => resolve(resolveValue));
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/ai/embeddings", () => ({
  generateAndStoreEmbedding: (...args: unknown[]) => mockGenerateAndStore(...args),
  buildJobEmbeddingText: vi.fn((job: { title: string; description?: string | null; required_skills?: string[] }) => {
    const parts: string[] = [job.title];
    if (job.description) parts.push(job.description);
    if (job.required_skills?.length) parts.push(`Required skills: ${job.required_skills.join(", ")}`);
    return parts.join("\n\n").trim();
  }),
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

import { refreshJobEmbedding } from "@/inngest/functions/ai/refresh-job-embedding";

const handler = refreshJobEmbedding as unknown as (args: {
  event: { data: Record<string, string> };
}) => Promise<{ success?: boolean; skipped?: boolean; reason?: string; jobId?: string }>;

const JOB_ID = "job-001";
const ORG_ID = "org-001";

// ── Tests ────────────────────────────────────────────────

describe("refreshJobEmbedding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should refresh job embedding when job and skills exist", async () => {
    const updateChain = createChainMock({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "job_openings") {
        // First call = select, second call = update
        const selectChain = createChainMock({
          data: { id: JOB_ID, organization_id: ORG_ID, title: "Engineer", description: "Build things" },
          error: null,
        });
        selectChain.update = vi.fn().mockReturnValue(updateChain);
        return selectChain;
      }
      if (table === "job_required_skills") {
        return createChainMock({
          data: [{ skill_name: "TypeScript" }, { skill_name: "React" }],
          error: null,
        });
      }
      return createChainMock();
    });

    mockGenerateAndStore.mockResolvedValue({ success: true });

    const result = await handler({
      event: { data: { jobId: JOB_ID, organizationId: ORG_ID } },
    });

    expect(result.success).toBe(true);
    expect(result.jobId).toBe(JOB_ID);
    expect(mockGenerateAndStore).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        entityType: "job_opening",
        entityId: JOB_ID,
      }),
    );
  });

  it("should skip when job not found", async () => {
    mockFrom.mockImplementation(() =>
      createChainMock({ data: null, error: { message: "Not found" } }),
    );

    const result = await handler({
      event: { data: { jobId: JOB_ID, organizationId: ORG_ID } },
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("job_not_found");
    expect(mockGenerateAndStore).not.toHaveBeenCalled();
  });

  it("should throw when embedding generation fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "job_openings") {
        return createChainMock({
          data: { id: JOB_ID, organization_id: ORG_ID, title: "Engineer", description: "Build" },
          error: null,
        });
      }
      if (table === "job_required_skills") {
        return createChainMock({ data: [], error: null });
      }
      return createChainMock();
    });

    mockGenerateAndStore.mockResolvedValue({ success: false, error: "API error" });

    await expect(
      handler({ event: { data: { jobId: JOB_ID, organizationId: ORG_ID } } }),
    ).rejects.toThrow("API error");
  });

  it("should work with no required skills", async () => {
    const updateChain = createChainMock({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "job_openings") {
        const chain = createChainMock({
          data: { id: JOB_ID, organization_id: ORG_ID, title: "Designer", description: null },
          error: null,
        });
        chain.update = vi.fn().mockReturnValue(updateChain);
        return chain;
      }
      if (table === "job_required_skills") {
        return createChainMock({ data: [], error: null });
      }
      return createChainMock();
    });

    mockGenerateAndStore.mockResolvedValue({ success: true });

    const result = await handler({
      event: { data: { jobId: JOB_ID, organizationId: ORG_ID } },
    });

    expect(result.success).toBe(true);
    expect(mockGenerateAndStore).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Designer",
      }),
    );
  });
});
