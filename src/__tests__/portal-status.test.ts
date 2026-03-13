import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P6-2a: Portal Status Tests
 *
 * Tests for token-based status portal actions: getApplicationStatus, withdrawApplication.
 * D32 §5.1 — token validation, withdrawal logic.
 */

// ── Mock Dependencies ────────────────────────────────────

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  single: vi.fn(),
  update: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
};

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/ai/status-narration", () => ({
  generateCandidateStatusNarration: vi.fn().mockResolvedValue({
    narration: "Your application is being reviewed.",
    error: undefined,
  }),
}));

vi.mock("@/lib/billing/plans", () => ({
  isValidPlan: vi.fn((plan: string) => ["starter", "growth", "pro", "enterprise"].includes(plan)),
}));

vi.mock("@/lib/utils/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Mock the token utils — we need valid tokens for testing
vi.mock("@/lib/utils/candidate-token", async () => {
  const actual = await vi.importActual("@/lib/utils/candidate-token");
  return actual;
});

import { createStatusToken } from "@/lib/utils/candidate-token";
import { withdrawApplication } from "@/lib/actions/portal-status";

describe("P6-2a: withdrawApplication", () => {
  const validPayload = {
    applicationId: "11111111-5001-4000-a000-000000000001",
    candidateId: "11111111-4001-4000-a000-000000000001",
    organizationId: "11111111-2001-4000-a000-000000000001",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chained methods
    mockSupabase.from.mockReturnThis();
    mockSupabase.select.mockReturnThis();
    mockSupabase.eq.mockReturnThis();
    mockSupabase.is.mockReturnThis();
    mockSupabase.update.mockReturnThis();
  });

  it("should reject an invalid token", async () => {
    const result = await withdrawApplication("bad-token");
    expect(result).toEqual({ error: expect.any(String) });
  });

  it("should reject withdrawal for non-active application", async () => {
    const token = createStatusToken(validPayload);
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: validPayload.applicationId, status: "hired" },
      error: null,
    });

    const result = await withdrawApplication(token);
    expect(result.error).toContain("Cannot withdraw");
  });

  it("should return error when application is not found", async () => {
    const token = createStatusToken(validPayload);
    mockSupabase.single.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await withdrawApplication(token);
    expect(result.error).toBe("Application not found");
  });

  it("should successfully withdraw an active application", async () => {
    const token = createStatusToken(validPayload);

    // First call: find application (SELECT → .single())
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: validPayload.applicationId, status: "active" },
      error: null,
    });

    // Second call: update chain (from → update → eq → eq)
    // The update call starts a new chain — mock it to resolve without error
    const updateChain = {
      eq: vi.fn().mockReturnThis(),
    };
    (updateChain as Record<string, unknown>).error = null;
    mockSupabase.update.mockReturnValueOnce(updateChain);

    const result = await withdrawApplication(token);
    expect(result).toEqual({ success: true });
  });
});
