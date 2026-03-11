import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateObject } from "ai";
import * as Sentry from "@sentry/nextjs";
import { consumeAiCredits, logAiUsage } from "@/lib/ai/credits";
import { parseResume } from "@/lib/ai/resume-parser";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  smartModel: "mock-smart-model",
  AI_MODELS: {
    fast: "gpt-4o-mini",
    smart: "gpt-4o",
    embedding: "text-embedding-3-small",
  },
}));

vi.mock("@/lib/ai/credits", () => ({
  consumeAiCredits: vi.fn(),
  logAiUsage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/constants/config", () => ({
  CONFIG: {
    AI: {
      RESUME_TEXT_MAX: 100,
    },
  },
}));

const ORG_ID = "org-test-123";
const USER_ID = "user-test-456";
const ENTITY_ID = "candidate-789";

const MOCK_PARSED_RESUME = {
  full_name: "John Doe",
  email: "john@example.com",
  phone: "+1-555-0100",
  current_title: "Senior Engineer",
  current_company: "Acme Corp",
  location: "San Francisco, CA",
  linkedin_url: "https://linkedin.com/in/johndoe",
  skills: ["TypeScript", "React", "Node.js"],
  summary: "Experienced full-stack engineer",
  years_of_experience: 8,
  education: [
    {
      institution: "MIT",
      degree: "BS",
      field: "Computer Science",
      year: 2016,
    },
  ],
  experience: [
    {
      company: "Acme Corp",
      title: "Senior Engineer",
      duration: "2020-present",
      description: "Led platform team",
    },
  ],
};

describe("parseResume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return parsed resume data on success", async () => {
    // Arrange
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: MOCK_PARSED_RESUME,
      usage: { inputTokens: 500, outputTokens: 300 },
    } as never);

    // Act
    const result = await parseResume({
      resumeText: "John Doe, Senior Engineer at Acme Corp",
      organizationId: ORG_ID,
      userId: USER_ID,
      entityId: ENTITY_ID,
    });

    // Assert
    expect(result.data).toEqual(MOCK_PARSED_RESUME);
    expect(result.error).toBeUndefined();
    expect(generateObject).toHaveBeenCalledOnce();
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        action: "resume_parse",
        status: "success",
        model: "gpt-4o",
      }),
    );
  });

  it("should return error when credits insufficient", async () => {
    // Arrange
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    // Act
    const result = await parseResume({
      resumeText: "Some resume text",
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    // Assert
    expect(result.data).toBeNull();
    expect(result.error).toBe("Insufficient AI credits");
    expect(generateObject).not.toHaveBeenCalled();
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "skipped",
        errorMessage: "Insufficient AI credits",
      }),
    );
  });

  it("should truncate resume text to CONFIG.AI.RESUME_TEXT_MAX", async () => {
    // Arrange — RESUME_TEXT_MAX is mocked to 100
    const longText = "A".repeat(200);
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: MOCK_PARSED_RESUME,
      usage: { inputTokens: 100, outputTokens: 100 },
    } as never);

    // Act
    await parseResume({
      resumeText: longText,
      organizationId: ORG_ID,
    });

    // Assert
    const callArgs = vi.mocked(generateObject).mock.calls[0]?.[0];
    expect((callArgs as { prompt: string }).prompt).toHaveLength(100);
  });

  it("should capture Sentry exception on error", async () => {
    // Arrange
    const error = new Error("Model timeout");
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockRejectedValue(error);

    // Act
    const result = await parseResume({
      resumeText: "Some resume",
      organizationId: ORG_ID,
      userId: USER_ID,
      entityId: ENTITY_ID,
    });

    // Assert
    expect(result.data).toBeNull();
    expect(result.error).toBe("Model timeout");
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        errorMessage: "Model timeout",
        entityId: ENTITY_ID,
      }),
    );
  });
});
