import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock setup (must be before imports) ──────────────────

const mockSingle = vi.fn();
const mockIs = vi.fn(() => ({ single: mockSingle }));
const mockEq2 = vi.fn(() => ({ is: mockIs }));
const mockEq1 = vi.fn(() => ({ eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ eq: mockEq1 }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: mockFrom }),
  createClient: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings", () => ({
  buildCandidateEmbeddingText: vi.fn(),
  generateAndStoreEmbedding: vi.fn(),
}));

vi.mock("@/lib/utils/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: vi.fn((_config, _trigger, handler) => handler),
  },
}));

import {
  buildCandidateEmbeddingText,
  generateAndStoreEmbedding,
} from "@/lib/ai/embeddings";

// Import the handler directly — the mock extracts it from createFunction
import { generateCandidateEmbedding } from "@/inngest/functions/ai/generate-candidate-embedding";

const mockedBuildText = vi.mocked(buildCandidateEmbeddingText);
const mockedGenerate = vi.mocked(generateAndStoreEmbedding);

describe("generateCandidateEmbedding Inngest handler", () => {
  const baseEvent = {
    data: {
      candidateId: "cand-001",
      organizationId: "org-001",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should skip when candidate is not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "not found" } });

    const handler = generateCandidateEmbedding as unknown as (ctx: { event: typeof baseEvent }) => Promise<unknown>;
    const result = await handler({ event: baseEvent });

    expect(result).toEqual({ skipped: true, reason: "candidate_not_found" });
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("should skip when candidate has no embeddable content", async () => {
    mockSingle.mockResolvedValue({
      data: { id: "cand-001", organization_id: "org-001", skills: [], resume_text: null, current_title: null, current_company: null },
      error: null,
    });
    mockedBuildText.mockReturnValue(null);

    const handler = generateCandidateEmbedding as unknown as (ctx: { event: typeof baseEvent }) => Promise<unknown>;
    const result = await handler({ event: baseEvent });

    expect(result).toEqual({ skipped: true, reason: "no_content" });
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("should generate embedding when candidate has content", async () => {
    const candidate = {
      id: "cand-001",
      organization_id: "org-001",
      resume_text: "5 years React",
      skills: ["React"],
      current_title: "Engineer",
      current_company: "Acme",
    };
    mockSingle.mockResolvedValue({ data: candidate, error: null });
    mockedBuildText.mockReturnValue("5 years React\n\nSkills: React");
    mockedGenerate.mockResolvedValue({ success: true });

    const handler = generateCandidateEmbedding as unknown as (ctx: { event: typeof baseEvent }) => Promise<unknown>;
    const result = await handler({ event: baseEvent });

    expect(result).toEqual({ success: true, candidateId: "cand-001" });
    expect(mockedGenerate).toHaveBeenCalledWith({
      organizationId: "org-001",
      entityType: "candidate",
      entityId: "cand-001",
      text: "5 years React\n\nSkills: React",
    });
  });

  it("should throw on embedding generation failure (for Inngest retry)", async () => {
    const candidate = {
      id: "cand-001",
      organization_id: "org-001",
      resume_text: "Resume",
      skills: [],
      current_title: null,
      current_company: null,
    };
    mockSingle.mockResolvedValue({ data: candidate, error: null });
    mockedBuildText.mockReturnValue("Resume");
    mockedGenerate.mockResolvedValue({ success: false, error: "API rate limit" });

    const handler = generateCandidateEmbedding as unknown as (ctx: { event: typeof baseEvent }) => Promise<unknown>;
    await expect(handler({ event: baseEvent })).rejects.toThrow("API rate limit");
  });
});
