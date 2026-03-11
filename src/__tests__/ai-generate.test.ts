import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateText, generateObject, streamText } from "ai";
import * as Sentry from "@sentry/nextjs";
import { consumeAiCredits, logAiUsage } from "@/lib/ai/credits";
import {
  generateJobDescription,
  generateEmailDraft,
  streamJobDescription,
} from "@/lib/ai/generate";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  chatModel: "mock-model",
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
      JOB_DESCRIPTION_MAX_TOKENS: 1500,
      EMAIL_DRAFT_MAX_TOKENS: 500,
    },
  },
}));

const ORG_ID = "org-test-123";
const USER_ID = "user-test-456";

describe("generateJobDescription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return generated text on success", async () => {
    // Arrange
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateText).mockResolvedValue({
      text: "A great job description",
      usage: { inputTokens: 100, outputTokens: 200 },
    } as never);

    // Act
    const result = await generateJobDescription({
      title: "Senior Engineer",
      department: "Engineering",
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    // Assert
    expect(result.text).toBe("A great job description");
    expect(result.error).toBeUndefined();
    expect(generateText).toHaveBeenCalledOnce();
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        action: "job_description_generate",
        status: "success",
      }),
    );
  });

  it("should return error when credits insufficient", async () => {
    // Arrange
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    // Act
    const result = await generateJobDescription({
      title: "Senior Engineer",
      organizationId: ORG_ID,
    });

    // Assert
    expect(result.text).toBeNull();
    expect(result.error).toBe("Insufficient AI credits");
    expect(generateText).not.toHaveBeenCalled();
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "skipped",
        errorMessage: "Insufficient AI credits",
      }),
    );
  });

  it("should capture Sentry exception on AI error", async () => {
    // Arrange
    const error = new Error("API rate limit exceeded");
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateText).mockRejectedValue(error);

    // Act
    const result = await generateJobDescription({
      title: "Senior Engineer",
      organizationId: ORG_ID,
    });

    // Assert
    expect(result.text).toBeNull();
    expect(result.error).toBe("API rate limit exceeded");
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        errorMessage: "API rate limit exceeded",
      }),
    );
  });
});

describe("generateEmailDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return subject and body on success", async () => {
    // Arrange
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        subject: "Thank you for applying",
        body: "Dear John, we appreciate your interest.",
      },
      usage: { inputTokens: 50, outputTokens: 100 },
    } as never);

    // Act
    const result = await generateEmailDraft({
      type: "rejection",
      candidateName: "John Doe",
      jobTitle: "Senior Engineer",
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    // Assert
    expect(result.subject).toBe("Thank you for applying");
    expect(result.body).toBe("Dear John, we appreciate your interest.");
    expect(result.error).toBeUndefined();
    expect(generateObject).toHaveBeenCalledOnce();
  });

  it("should return error when credits insufficient", async () => {
    // Arrange
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    // Act
    const result = await generateEmailDraft({
      type: "outreach",
      candidateName: "Jane Smith",
      jobTitle: "Product Manager",
      organizationId: ORG_ID,
    });

    // Assert
    expect(result.subject).toBeNull();
    expect(result.body).toBeNull();
    expect(result.error).toBe("Insufficient AI credits");
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("should handle all email types", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: { subject: "Subject", body: "Body" },
      usage: { inputTokens: 50, outputTokens: 100 },
    } as never);

    const types = ["rejection", "outreach", "update", "follow_up"] as const;

    for (const type of types) {
      vi.clearAllMocks();
      vi.mocked(consumeAiCredits).mockResolvedValue(true);
      vi.mocked(generateObject).mockResolvedValue({
        object: { subject: "Subject", body: "Body" },
        usage: { inputTokens: 50, outputTokens: 100 },
      } as never);

      const result = await generateEmailDraft({
        type,
        candidateName: "Test",
        jobTitle: "Test Role",
        organizationId: ORG_ID,
      });

      expect(result.subject).toBe("Subject");
      expect(result.body).toBe("Body");
      expect(result.error).toBeUndefined();
    }
  });

  it("should capture Sentry exception on AI error", async () => {
    // Arrange
    const error = new Error("Model unavailable");
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockRejectedValue(error);

    // Act
    const result = await generateEmailDraft({
      type: "update",
      candidateName: "John",
      jobTitle: "Engineer",
      organizationId: ORG_ID,
    });

    // Assert
    expect(result.subject).toBeNull();
    expect(result.body).toBeNull();
    expect(result.error).toBe("Model unavailable");
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});

describe("streamJobDescription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null when credits insufficient", async () => {
    // Arrange
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    // Act
    const result = await streamJobDescription({
      title: "Senior Engineer",
      organizationId: ORG_ID,
    });

    // Assert
    expect(result).toBeNull();
    expect(streamText).not.toHaveBeenCalled();
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "skipped",
        errorMessage: "Insufficient AI credits",
      }),
    );
  });

  it("should call streamText with correct params when credits available", async () => {
    // Arrange
    const mockStreamResult = { toDataStreamResponse: vi.fn() };
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(streamText).mockReturnValue(mockStreamResult as never);

    // Act
    const result = await streamJobDescription({
      title: "Senior Engineer",
      department: "Engineering",
      keyPoints: "Remote friendly",
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    // Assert
    expect(result).toBe(mockStreamResult);
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        maxOutputTokens: 1500,
      }),
    );
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Senior Engineer"),
      }),
    );
  });
});
