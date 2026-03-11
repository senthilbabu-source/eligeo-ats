import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateText, generateObject, streamText } from "ai";
import * as Sentry from "@sentry/nextjs";
import { consumeAiCredits, logAiUsage } from "@/lib/ai/credits";
import {
  generateJobDescription,
  generateEmailDraft,
  streamJobDescription,
  buildIntentContext,
  checkJobDescriptionBias,
  suggestJobTitle,
  suggestSkillsDelta,
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

describe("buildIntentContext", () => {
  it("should include location when reason is new_location with newLocation", () => {
    const result = buildIntentContext({ reason: "new_location", newLocation: "London" });
    expect(result).toContain("London");
    expect(result).toContain("location");
  });

  it("should handle new_location without newLocation value", () => {
    const result = buildIntentContext({ reason: "new_location" });
    expect(result).toContain("location");
    expect(result).not.toContain("undefined");
  });

  it("should include level when reason is new_level with newLevel", () => {
    const result = buildIntentContext({ reason: "new_level", newLevel: "Staff" });
    expect(result).toContain("Staff");
    expect(result).toContain("seniority level");
  });

  it("should mention repost context for repost reason", () => {
    const result = buildIntentContext({ reason: "repost" });
    expect(result).toContain("repost");
  });

  it("should mention team/department context for different_team reason", () => {
    const result = buildIntentContext({ reason: "different_team" });
    expect(result).toContain("team");
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

describe("checkJobDescriptionBias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty arrays when credits insufficient", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    const result = await checkJobDescriptionBias({ text: "We need a rockstar", organizationId: ORG_ID });

    expect(result.flaggedTerms).toEqual([]);
    expect(result.suggestions).toEqual({});
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("should return flagged terms and suggestions from AI response", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        flaggedTerms: ["rockstar", "ninja"],
        suggestions: { rockstar: "strong performer", ninja: "expert" },
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    } as never);

    const result = await checkJobDescriptionBias({
      text: "We need a rockstar ninja developer",
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(result.flaggedTerms).toEqual(["rockstar", "ninja"]);
    expect(result.suggestions).toEqual({ rockstar: "strong performer", ninja: "expert" });
    expect(result.error).toBeUndefined();
  });
});

describe("suggestJobTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null title when credits insufficient", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    const result = await suggestJobTitle({
      title: "Software Engineer",
      intent: { reason: "new_level", newLevel: "Senior" },
      organizationId: ORG_ID,
    });

    expect(result.suggestedTitle).toBeNull();
    expect(result.reason).toBeNull();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("should return suggested title with reason", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: { suggestedTitle: "Senior Software Engineer", reason: "Level change from intent" },
      usage: { inputTokens: 50, outputTokens: 30 },
    } as never);

    const result = await suggestJobTitle({
      title: "Software Engineer",
      intent: { reason: "new_level", newLevel: "Senior" },
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(result.suggestedTitle).toBe("Senior Software Engineer");
    expect(result.reason).toBe("Level change from intent");
    expect(result.error).toBeUndefined();
  });
});

describe("suggestSkillsDelta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty arrays when credits insufficient", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    const result = await suggestSkillsDelta({
      intent: { reason: "new_level" },
      existingSkillNames: ["React"],
      organizationId: ORG_ID,
    });

    expect(result.add).toEqual([]);
    expect(result.remove).toEqual([]);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("should return add and remove skill suggestions", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        add: [{ name: "System Design", importance: "required" }],
        remove: ["Junior mentoring"],
      },
      usage: { inputTokens: 80, outputTokens: 60 },
    } as never);

    const result = await suggestSkillsDelta({
      intent: { reason: "new_level", newLevel: "Staff" },
      existingSkillNames: ["React", "Junior mentoring"],
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(result.add).toEqual([{ name: "System Design", importance: "required" }]);
    expect(result.remove).toEqual(["Junior mentoring"]);
    expect(result.error).toBeUndefined();
  });
});
