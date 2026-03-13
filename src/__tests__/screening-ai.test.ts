import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateText, generateObject } from "ai";
import * as Sentry from "@sentry/nextjs";
import { consumeAiCredits, logAiUsage } from "@/lib/ai/credits";
import {
  generateScreeningQuestionBatch,
  evaluateCandidateAnswer,
  generateScreeningSummary,
  generateScreeningQuestion,
} from "@/lib/ai/screening";
import type { ScreeningQuestion, ScreeningTurn } from "@/lib/types/ground-truth";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  chatModel: "mock-chat-model",
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

const ORG_ID = "org-test-123";
const USER_ID = "user-test-456";

const MOCK_QUESTIONS: ScreeningQuestion[] = [
  {
    id: "q-1",
    order: 1,
    topic: "Technical background",
    raw_question: "Tell me about your technical experience",
    is_required: true,
    scoring_criteria: "Depth of experience",
  },
  {
    id: "q-2",
    order: 2,
    topic: "System design",
    raw_question: "How would you design a scalable API?",
    is_required: true,
  },
];

const MOCK_TURNS: ScreeningTurn[] = [
  {
    id: "t-1",
    question_id: "q-1",
    ai_question_text: "Can you walk me through your technical background?",
    candidate_answer: "I have 5 years of experience building distributed systems at scale.",
    turn_score: 0.8,
    timestamp: "2026-03-12T10:00:00Z",
  },
  {
    id: "t-2",
    question_id: "q-2",
    ai_question_text: "How would you approach designing a scalable API?",
    candidate_answer: "I would start with REST, add caching, use rate limiting, and plan for horizontal scaling.",
    ai_follow_up: "Can you elaborate on your caching strategy?",
    candidate_follow_up_answer: "I'd use Redis for hot data, CDN for static responses, and HTTP ETags for client-side.",
    turn_score: 0.9,
    timestamp: "2026-03-12T10:05:00Z",
  },
];

// ── generateScreeningQuestionBatch ─────────────────────────

describe("P6-4: generateScreeningQuestionBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return rephrased questions on success", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        rephrased: [
          { questionId: "q-1", aiText: "Can you walk me through your technical background?" },
          { questionId: "q-2", aiText: "How would you approach designing a scalable API?" },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 150 },
    } as never);

    const result = await generateScreeningQuestionBatch({
      questions: MOCK_QUESTIONS,
      jobTitle: "Senior Engineer",
      organizationId: ORG_ID,
    });

    expect(result.rephrased).toHaveLength(2);
    expect(result.rephrased[0]!.questionId).toBe("q-1");
    expect(result.error).toBeUndefined();
    expect(generateObject).toHaveBeenCalledOnce();
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        action: "screening_batch",
        status: "success",
      }),
    );
  });

  it("should include org instructions in prompt when provided", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: { rephrased: [] },
      usage: { inputTokens: 50, outputTokens: 50 },
    } as never);

    await generateScreeningQuestionBatch({
      questions: MOCK_QUESTIONS,
      jobTitle: "Engineer",
      orgInstructions: "Be friendly and casual",
      organizationId: ORG_ID,
    });

    const call = vi.mocked(generateObject).mock.calls[0]![0] as { system: string };
    expect(call.system).toContain("Be friendly and casual");
  });

  it("should return error when credits insufficient", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    const result = await generateScreeningQuestionBatch({
      questions: MOCK_QUESTIONS,
      jobTitle: "Engineer",
      organizationId: ORG_ID,
    });

    expect(result.rephrased).toHaveLength(0);
    expect(result.error).toBe("Insufficient AI credits");
    expect(generateObject).not.toHaveBeenCalled();
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: "skipped" }),
    );
  });

  it("should capture exception and return error on AI failure", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockRejectedValue(new Error("API timeout"));

    const result = await generateScreeningQuestionBatch({
      questions: MOCK_QUESTIONS,
      jobTitle: "Engineer",
      organizationId: ORG_ID,
    });

    expect(result.rephrased).toHaveLength(0);
    expect(result.error).toBe("API timeout");
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", errorMessage: "API timeout" }),
    );
  });
});

// ── evaluateCandidateAnswer ────────────────────────────────

describe("P6-4: evaluateCandidateAnswer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return evaluation with no follow-up for good answer", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        needsFollowup: false,
        preliminaryScore: 0.85,
      },
      usage: { inputTokens: 80, outputTokens: 30 },
    } as never);

    const result = await evaluateCandidateAnswer({
      question: MOCK_QUESTIONS[0]!,
      aiQuestionText: "Can you walk me through your technical background?",
      answer: "I have 5 years of experience in distributed systems, specializing in Kafka and Go.",
      organizationId: ORG_ID,
    });

    expect(result.needsFollowup).toBe(false);
    expect(result.preliminaryScore).toBe(0.85);
    expect(result.followupText).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it("should return follow-up for vague answer", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        needsFollowup: true,
        followupText: "Could you elaborate on specific projects you've worked on?",
        preliminaryScore: 0.3,
      },
      usage: { inputTokens: 80, outputTokens: 50 },
    } as never);

    const result = await evaluateCandidateAnswer({
      question: MOCK_QUESTIONS[0]!,
      aiQuestionText: "Can you walk me through your technical background?",
      answer: "I know some stuff.",
      organizationId: ORG_ID,
    });

    expect(result.needsFollowup).toBe(true);
    expect(result.followupText).toContain("elaborate");
    expect(result.preliminaryScore).toBe(0.3);
  });

  it("should include scoring criteria in system prompt when present", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { needsFollowup: false, preliminaryScore: 0.7 },
      usage: { inputTokens: 50, outputTokens: 20 },
    } as never);

    await evaluateCandidateAnswer({
      question: MOCK_QUESTIONS[0]!, // has scoring_criteria: "Depth of experience"
      aiQuestionText: "Question text",
      answer: "Some answer",
      organizationId: ORG_ID,
    });

    const call = vi.mocked(generateObject).mock.calls[0]![0] as { system: string };
    expect(call.system).toContain("Depth of experience");
  });

  it("should default to no follow-up with neutral score on error", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Rate limited"));

    const result = await evaluateCandidateAnswer({
      question: MOCK_QUESTIONS[0]!,
      aiQuestionText: "Question text",
      answer: "Answer text",
      organizationId: ORG_ID,
    });

    expect(result.needsFollowup).toBe(false);
    expect(result.preliminaryScore).toBe(0.5);
    expect(result.error).toBe("Rate limited");
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it("should not consume credits (0 cost, amortized)", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { needsFollowup: false, preliminaryScore: 0.7 },
      usage: { inputTokens: 50, outputTokens: 20 },
    } as never);

    await evaluateCandidateAnswer({
      question: MOCK_QUESTIONS[0]!,
      aiQuestionText: "Q",
      answer: "A",
      organizationId: ORG_ID,
    });

    // evaluateCandidateAnswer does NOT call consumeAiCredits (0 credits)
    expect(consumeAiCredits).not.toHaveBeenCalled();
  });
});

// ── generateScreeningSummary ───────────────────────────────

describe("P6-4: generateScreeningSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return summary with scores on success", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        summary: "Strong candidate with deep distributed systems experience.",
        overallScore: 0.85,
        scoreBreakdown: { "q-1": 0.8, "q-2": 0.9 },
        keySignals: ["5 years distributed systems", "Strong caching knowledge"],
      },
      usage: { inputTokens: 300, outputTokens: 200 },
    } as never);

    const result = await generateScreeningSummary({
      turns: MOCK_TURNS,
      questions: MOCK_QUESTIONS,
      jobTitle: "Senior Engineer",
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(result.summary).toContain("Strong candidate");
    expect(result.overallScore).toBe(0.85);
    expect(result.scoreBreakdown["q-1"]).toBe(0.8);
    expect(result.keySignals).toHaveLength(2);
    expect(result.error).toBeUndefined();
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "screening_summary",
        status: "success",
      }),
    );
  });

  it("should return error when credits insufficient", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(false);

    const result = await generateScreeningSummary({
      turns: MOCK_TURNS,
      questions: MOCK_QUESTIONS,
      jobTitle: "Engineer",
      organizationId: ORG_ID,
    });

    expect(result.summary).toBe("");
    expect(result.overallScore).toBe(0);
    expect(result.error).toBe("Insufficient AI credits");
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("should build transcript with follow-ups when present", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        summary: "Good",
        overallScore: 0.7,
        scoreBreakdown: {},
        keySignals: [],
      },
      usage: { inputTokens: 200, outputTokens: 100 },
    } as never);

    await generateScreeningSummary({
      turns: MOCK_TURNS,
      questions: MOCK_QUESTIONS,
      jobTitle: "Engineer",
      organizationId: ORG_ID,
    });

    const call = vi.mocked(generateObject).mock.calls[0]![0] as { prompt: string };
    // Should include follow-up Q&A from turn 2
    expect(call.prompt).toContain("Follow-up Q:");
    expect(call.prompt).toContain("Follow-up A:");
    expect(call.prompt).toContain("Redis");
  });

  it("should capture exception and return empty result on error", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValue(true);
    vi.mocked(generateObject).mockRejectedValue(new Error("Server error"));

    const result = await generateScreeningSummary({
      turns: MOCK_TURNS,
      questions: MOCK_QUESTIONS,
      jobTitle: "Engineer",
      organizationId: ORG_ID,
    });

    expect(result.summary).toBe("");
    expect(result.overallScore).toBe(0);
    expect(result.scoreBreakdown).toEqual({});
    expect(result.keySignals).toEqual([]);
    expect(result.error).toBe("Server error");
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });
});

// ── generateScreeningQuestion (single fallback) ────────────

describe("P6-4: generateScreeningQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return rephrased question text on success", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "Could you share your experience with backend systems?",
      usage: { inputTokens: 40, outputTokens: 20 },
    } as never);

    const result = await generateScreeningQuestion({
      rawQuestion: "Tell me about your backend experience",
      jobTitle: "Backend Engineer",
      organizationId: ORG_ID,
    });

    expect(result.questionText).toContain("backend");
    expect(result.error).toBeUndefined();
    expect(generateText).toHaveBeenCalledOnce();
  });

  it("should include org instructions in system prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "Hey! What's your backend story?",
      usage: { inputTokens: 40, outputTokens: 20 },
    } as never);

    await generateScreeningQuestion({
      rawQuestion: "Tell me about backend experience",
      jobTitle: "Engineer",
      orgInstructions: "Keep it super casual",
      organizationId: ORG_ID,
    });

    const call = vi.mocked(generateText).mock.calls[0]![0] as { system: string };
    expect(call.system).toContain("Keep it super casual");
  });

  it("should fallback to raw question on error", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("Quota exceeded"));

    const result = await generateScreeningQuestion({
      rawQuestion: "Tell me about your experience",
      jobTitle: "Engineer",
      organizationId: ORG_ID,
    });

    expect(result.questionText).toBe("Tell me about your experience");
    expect(result.error).toBe("Quota exceeded");
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it("should not consume credits (0 cost)", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "Rephrased question",
      usage: { inputTokens: 30, outputTokens: 15 },
    } as never);

    await generateScreeningQuestion({
      rawQuestion: "Raw question",
      jobTitle: "Engineer",
      organizationId: ORG_ID,
    });

    expect(consumeAiCredits).not.toHaveBeenCalled();
  });
});
