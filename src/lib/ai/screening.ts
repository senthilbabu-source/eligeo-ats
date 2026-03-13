import { generateText, generateObject } from "ai";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { chatModel, smartModel, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";
import type { ScreeningQuestion, ScreeningTurn } from "@/lib/types/ground-truth";

// ── 1. Batch rephrase all questions upfront ──────────────────

/**
 * D32 §7.3 #4 — Batch rephrase recruiter's raw questions into conversational AI text.
 * Called once when candidate opens screening page.
 * Model: gpt-4o-mini | Credits: 1 (screening_batch)
 */
export async function generateScreeningQuestionBatch(params: {
  questions: ScreeningQuestion[];
  jobTitle: string;
  orgInstructions?: string;
  organizationId: string;
}): Promise<{
  rephrased: Array<{ questionId: string; aiText: string }>;
  error?: string;
}> {
  const { questions, jobTitle, orgInstructions, organizationId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "screening_batch");
  if (!credited) {
    await logAiUsage({
      organizationId,
      action: "screening_batch",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { rephrased: [], error: "Insufficient AI credits" };
  }

  try {
    const schema = z.object({
      rephrased: z.array(
        z.object({
          questionId: z.string(),
          aiText: z.string(),
        }),
      ),
    });

    const instructionLines = [
      `You are conducting a screening conversation for the role: ${jobTitle}.`,
      orgInstructions && `Tone instructions: ${orgInstructions}`,
      "Rephrase each question to sound natural and conversational — as if a friendly recruiter is asking in a chat.",
      "Do NOT change the topic or intent. Do NOT add new questions.",
      "Keep each question to 1-2 sentences.",
    ]
      .filter(Boolean)
      .join("\n");

    const questionList = questions
      .map((q) => `ID: ${q.id} | Topic: ${q.topic} | Question: ${q.raw_question}`)
      .join("\n");

    const { object, usage } = await generateObject({
      model: chatModel,
      system: instructionLines,
      prompt: `Rephrase these screening questions:\n\n${questionList}`,
      schema,
      maxOutputTokens: 1000,
    });

    await logAiUsage({
      organizationId,
      action: "screening_batch",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return { rephrased: object.rephrased };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      action: "screening_batch",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { rephrased: [], error: message };
  }
}

// ── 2. Evaluate a single candidate answer ────────────────────

/**
 * D32 §7.3 #2 — Decide if a follow-up is needed for a candidate's answer.
 * Triggers follow-up when: answer < 50 chars OR doesn't address the question topic.
 * Model: gpt-4o-mini | Credits: 0 (amortized into session cost)
 */
export async function evaluateCandidateAnswer(params: {
  question: ScreeningQuestion;
  aiQuestionText: string;
  answer: string;
  organizationId: string;
}): Promise<{
  needsFollowup: boolean;
  followupText?: string;
  preliminaryScore: number;
  error?: string;
}> {
  const { question, aiQuestionText, answer, organizationId } = params;
  const startTime = Date.now();

  try {
    const schema = z.object({
      needsFollowup: z.boolean(),
      followupText: z.string().optional(),
      preliminaryScore: z.number().min(0).max(1),
    });

    const systemPrompt = [
      "You are evaluating a candidate's screening answer.",
      "Decide if the answer is sufficient or needs a follow-up.",
      "A follow-up is needed when:",
      "- The answer is too short (vague, one-liner) to properly evaluate",
      "- The answer doesn't address the question topic",
      "If a follow-up is needed, write a friendly, encouraging follow-up question.",
      "Score the answer from 0 (no relevant content) to 1 (excellent, thorough).",
      question.scoring_criteria && `Scoring criteria: ${question.scoring_criteria}`,
      "Do NOT ask discriminatory questions. Do NOT ask about protected characteristics.",
    ]
      .filter(Boolean)
      .join("\n");

    const { object, usage } = await generateObject({
      model: chatModel,
      system: systemPrompt,
      prompt: `Question: ${aiQuestionText}\n\nCandidate's answer: ${answer}`,
      schema,
      maxOutputTokens: 300,
    });

    await logAiUsage({
      organizationId,
      action: "screening_evaluate",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return {
      needsFollowup: object.needsFollowup,
      followupText: object.followupText,
      preliminaryScore: object.preliminaryScore,
    };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      action: "screening_evaluate",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    // On error, default to no follow-up with neutral score
    return { needsFollowup: false, preliminaryScore: 0.5, error: message };
  }
}

// ── 3. Generate screening summary + final score ──────────────

/**
 * D32 §7.3 #3 — After all answers: generate summary + score.
 * Model: gpt-4o | Credits: 5 (screening_summary)
 */
export async function generateScreeningSummary(params: {
  turns: ScreeningTurn[];
  questions: ScreeningQuestion[];
  jobTitle: string;
  organizationId: string;
  userId?: string;
}): Promise<{
  summary: string;
  overallScore: number;
  scoreBreakdown: Record<string, number>;
  keySignals: string[];
  error?: string;
}> {
  const { turns, questions, jobTitle, organizationId, userId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "screening_summary");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "screening_summary",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return {
      summary: "",
      overallScore: 0,
      scoreBreakdown: {},
      keySignals: [],
      error: "Insufficient AI credits",
    };
  }

  try {
    const schema = z.object({
      summary: z.string(),
      overallScore: z.number().min(0).max(1),
      scoreBreakdown: z.record(z.string(), z.number()),
      keySignals: z.array(z.string()),
    });

    const transcript = turns
      .map((t) => {
        const q = questions.find((q) => q.id === t.question_id);
        const lines = [
          `Topic: ${q?.topic ?? "Unknown"}`,
          `Q: ${t.ai_question_text}`,
          `A: ${t.candidate_answer}`,
        ];
        if (t.ai_follow_up) lines.push(`Follow-up Q: ${t.ai_follow_up}`);
        if (t.candidate_follow_up_answer) lines.push(`Follow-up A: ${t.candidate_follow_up_answer}`);
        return lines.join("\n");
      })
      .join("\n\n---\n\n");

    const questionMap = questions
      .map((q) => `${q.id}: ${q.topic} (${q.scoring_criteria ?? "general assessment"})`)
      .join("\n");

    const { object, usage } = await generateObject({
      model: smartModel,
      system: [
        `You are evaluating a screening conversation for the role: ${jobTitle}.`,
        "Provide an objective assessment based ONLY on the candidate's answers.",
        "Do NOT factor in name, gender, age, ethnicity, or any protected characteristic.",
        "Score each question from 0 (poor) to 1 (excellent).",
        "The overall score should reflect weighted quality across all answers.",
        "Key signals: list 3-5 notable strengths or concerns.",
        "Summary: 2-3 sentences for the recruiter.",
      ].join("\n"),
      prompt: `Question scoring criteria:\n${questionMap}\n\nTranscript:\n${transcript}`,
      schema,
      maxOutputTokens: 800,
    });

    await logAiUsage({
      organizationId,
      userId,
      action: "screening_summary",
      model: AI_MODELS.smart,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return {
      summary: object.summary,
      overallScore: object.overallScore,
      scoreBreakdown: object.scoreBreakdown,
      keySignals: object.keySignals,
    };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "screening_summary",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return {
      summary: "",
      overallScore: 0,
      scoreBreakdown: {},
      keySignals: [],
      error: message,
    };
  }
}

// ── 4. Single question rephrase (fallback for Starter plan) ──

/**
 * D32 §7.3 #1 — Rephrase a single question (used as fallback).
 * Model: gpt-4o-mini | Credits: 0 (amortized)
 */
export async function generateScreeningQuestion(params: {
  rawQuestion: string;
  jobTitle: string;
  orgInstructions?: string;
  organizationId: string;
}): Promise<{ questionText: string; error?: string }> {
  const { rawQuestion, jobTitle, orgInstructions, organizationId } = params;
  const startTime = Date.now();

  try {
    const { text, usage } = await generateText({
      model: chatModel,
      system: [
        `You are a friendly recruiter screening candidates for: ${jobTitle}.`,
        orgInstructions && `Tone: ${orgInstructions}`,
        "Rephrase the question to sound natural and conversational.",
        "Keep it to 1-2 sentences. Do NOT change the topic or intent.",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: `Rephrase this screening question: "${rawQuestion}"`,
      maxOutputTokens: 200,
    });

    await logAiUsage({
      organizationId,
      action: "screening_question",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs: Date.now() - startTime,
      status: "success",
    });

    return { questionText: text };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      action: "screening_question",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    // Fallback: return the raw question
    return { questionText: rawQuestion, error: message };
  }
}
