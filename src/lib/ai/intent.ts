import { generateObject } from "ai";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { chatModel, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";
import { CONFIG } from "@/lib/constants/config";

/**
 * Parsed intent from natural language command bar input.
 */
export interface ParsedIntent {
  action:
    | "search_candidates"
    | "search_jobs"
    | "create_job"
    | "create_candidate"
    | "move_stage"
    | "draft_email"
    | "generate_job_description"
    | "find_matches"
    | "navigate"
    | "unknown";
  params: Record<string, string>;
  confidence: number;
  display: string; // Human-readable description of what will happen
}

const intentActions = [
  "search_candidates",
  "search_jobs",
  "create_job",
  "create_candidate",
  "move_stage",
  "draft_email",
  "generate_job_description",
  "find_matches",
  "navigate",
  "unknown",
] as const;

const intentSchema = z.object({
  action: z.enum(intentActions),
  params: z.record(z.string(), z.string()),
  confidence: z.number(),
  display: z.string(),
});

const INTENT_PROMPT = `You are a command parser for an ATS (Applicant Tracking System) called Eligeo.
Parse the user's natural language input into a structured intent.

Available actions:
- search_candidates: Search for candidates. Params: query (search terms)
- search_jobs: Search for jobs. Params: query (search terms)
- create_job: Create a new job. Params: title, department (optional)
- create_candidate: Add a new candidate. Params: name, email (optional)
- move_stage: Move a candidate to a pipeline stage. Params: candidate (name), stage (stage name)
- draft_email: Draft an email. Params: type (rejection/outreach/update/follow_up), candidate (name), job (title), tone (warm/professional/casual)
- generate_job_description: Generate a job description. Params: title, key_points (optional)
- find_matches: Find AI-matched candidates for a job. Params: job (title or description)
- navigate: Go to a page. Params: page (jobs/candidates/dashboard/settings/pipelines)
- unknown: Cannot determine intent`;

/**
 * Parse natural language input into a structured intent.
 * Used by the command bar (⌘K) to map user input to server actions.
 */
export async function parseIntent(params: {
  input: string;
  organizationId: string;
  userId?: string;
}): Promise<ParsedIntent> {
  const { input, organizationId, userId } = params;
  const startTime = Date.now();

  // Quick pattern matching for common shortcuts (no AI needed)
  const quickMatch = matchQuickPatterns(input);
  if (quickMatch) return quickMatch;

  // Use AI for complex intents
  const credited = await consumeAiCredits(organizationId, "nl_intent");
  if (!credited) {
    return {
      action: "unknown",
      params: {},
      confidence: 0,
      display: "Insufficient AI credits for command parsing",
    };
  }

  try {
    const { object, usage } = await generateObject({
      model: chatModel,
      schema: intentSchema,
      system: INTENT_PROMPT,
      prompt: input,
      maxOutputTokens: CONFIG.AI.INTENT_MAX_TOKENS,
    });

    const latencyMs = Date.now() - startTime;

    await logAiUsage({
      organizationId,
      userId,
      action: "nl_intent",
      model: AI_MODELS.fast,
      tokensInput: usage?.inputTokens,
      tokensOutput: usage?.outputTokens,
      latencyMs,
      status: "success",
      metadata: { input, parsed_action: object.action },
    });

    return {
      action: object.action ?? "unknown",
      params: object.params ?? {},
      confidence: object.confidence ?? 0,
      display: object.display ?? "Unknown command",
    };
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "nl_intent",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });

    return {
      action: "unknown",
      params: {},
      confidence: 0,
      display: "Failed to parse command",
    };
  }
}

/**
 * Fast pattern matching for common commands — avoids AI call.
 */
function matchQuickPatterns(input: string): ParsedIntent | null {
  const lower = input.toLowerCase().trim();

  // Navigation
  if (/^(go to |open |show )?(jobs|job list)$/i.test(lower)) {
    return { action: "navigate", params: { page: "jobs" }, confidence: 1, display: "Navigate to Jobs" };
  }
  if (/^(go to |open |show )?(candidates|candidate list)$/i.test(lower)) {
    return { action: "navigate", params: { page: "candidates" }, confidence: 1, display: "Navigate to Candidates" };
  }
  if (/^(go to |open |show )?(dashboard|home)$/i.test(lower)) {
    return { action: "navigate", params: { page: "dashboard" }, confidence: 1, display: "Navigate to Dashboard" };
  }
  if (/^(go to |open |show )?settings$/i.test(lower)) {
    return { action: "navigate", params: { page: "settings" }, confidence: 1, display: "Navigate to Settings" };
  }
  if (/^(go to |open |show |manage )?(pipelines?|pipeline templates?)$/i.test(lower)) {
    return { action: "navigate", params: { page: "pipelines" }, confidence: 1, display: "Navigate to Pipeline Settings" };
  }

  // Quick search
  if (lower.startsWith("find ") || lower.startsWith("search ")) {
    const query = input.replace(/^(find|search)\s+/i, "").trim();
    if (/candidates?/i.test(query)) {
      return {
        action: "search_candidates",
        params: { query: query.replace(/candidates?\s*/i, "").trim() },
        confidence: 0.9,
        display: `Search candidates: ${query}`,
      };
    }
    if (/jobs?/i.test(query)) {
      return {
        action: "search_jobs",
        params: { query: query.replace(/jobs?\s*/i, "").trim() },
        confidence: 0.9,
        display: `Search jobs: ${query}`,
      };
    }
    // Default: search candidates
    return {
      action: "search_candidates",
      params: { query },
      confidence: 0.7,
      display: `Search candidates: ${query}`,
    };
  }

  // New job / new candidate
  if (/^(new|create|add) job/i.test(lower)) {
    return { action: "create_job", params: {}, confidence: 1, display: "Create a new job" };
  }
  if (/^(new|create|add) candidate/i.test(lower)) {
    return { action: "create_candidate", params: {}, confidence: 1, display: "Add a new candidate" };
  }

  return null; // No quick match — fall through to AI
}
