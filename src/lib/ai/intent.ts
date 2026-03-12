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
    | "clone_job"
    | "create_offer"
    | "check_offer"
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
  "clone_job",
  "create_offer",
  "check_offer",
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
- clone_job: Clone a job with intent. Params: title (job title to clone), reason (new_location/new_level/repost/different_team), location (new location if applicable), level (new level if applicable)
- create_offer: Create an offer for a candidate. Params: candidate (name), job (title, optional)
- check_offer: Check offer status or list offers. Params: candidate (name, optional), status (draft/pending_approval/approved/sent/signed/declined/expired/withdrawn, optional)
- navigate: Go to a page. Params: page (jobs/candidates/dashboard/settings/pipelines/offers/approvals)
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

  // Navigation — offers/approvals
  if (/^(go to |open |show )?(offers?|offer list)$/i.test(lower)) {
    return { action: "navigate", params: { page: "offers" }, confidence: 1, display: "Navigate to Offers" };
  }
  if (/^(go to |open |show )?(approvals?|approval inbox|my approvals?)$/i.test(lower)) {
    return { action: "navigate", params: { page: "approvals" }, confidence: 1, display: "Navigate to Approvals" };
  }

  // New job / new candidate
  if (/^(new|create|add) job/i.test(lower)) {
    return { action: "create_job", params: {}, confidence: 1, display: "Create a new job" };
  }
  if (/^(new|create|add) candidate/i.test(lower)) {
    return { action: "create_candidate", params: {}, confidence: 1, display: "Add a new candidate" };
  }

  // Create offer — "create offer for [candidate]", "new offer for [candidate]", "offer [candidate]"
  const createOfferMatch = /^(?:create|new|make|draft)\s+offer\s+(?:for\s+)?(.+)$/i.exec(lower);
  if (createOfferMatch) {
    const candidate = (createOfferMatch[1] ?? "").trim();
    return {
      action: "create_offer",
      params: { candidate },
      confidence: 0.95,
      display: `Create offer for ${candidate}`,
    };
  }

  // Check offer — "check offer for [candidate]", "offer status [candidate]", "check offers"
  const checkOfferMatch = /^(?:check|show|view|list)\s+offers?\s*(?:for\s+)?(.*)$/i.exec(lower);
  if (checkOfferMatch) {
    const candidate = (checkOfferMatch[1] ?? "").trim();
    return {
      action: "check_offer",
      params: candidate ? { candidate } : {},
      confidence: 0.9,
      display: candidate ? `Check offers for ${candidate}` : "Check all offers",
    };
  }
  if (/^offer status/i.test(lower)) {
    const rest = lower.replace(/^offer status\s*/i, "").trim();
    return {
      action: "check_offer",
      params: rest ? { candidate: rest } : {},
      confidence: 0.9,
      display: rest ? `Check offer status for ${rest}` : "Check offer statuses",
    };
  }

  // Clone job intent patterns (E2) — most-specific first
  // "clone [title] for [level] level" → new_level (must match before generic location pattern)
  const cloneForLevel = /^clone\s+(.+?)\s+(?:for|as)\s+(.+?)\s+level$/i.exec(lower);
  if (cloneForLevel) {
    const title = (cloneForLevel[1] ?? "").trim();
    const level = (cloneForLevel[2] ?? "").trim();
    return {
      action: "clone_job",
      params: { title, reason: "new_level", level },
      confidence: 0.9,
      display: `Clone "${title}" at ${level} level`,
    };
  }

  // "clone [title] for [location]" → new_location intent
  const cloneForLocation = /^clone\s+(.+?)\s+for\s+(.+)$/i.exec(lower);
  if (cloneForLocation) {
    const title = (cloneForLocation[1] ?? "").trim();
    const location = (cloneForLocation[2] ?? "").trim();
    return {
      action: "clone_job",
      params: { title, reason: "new_location", location },
      confidence: 0.95,
      display: `Clone "${title}" for ${location}`,
    };
  }

  // "repost [title]" → repost intent
  const repost = /^repost\s+(.+)$/i.exec(lower);
  if (repost) {
    const title = (repost[1] ?? "").trim();
    return {
      action: "clone_job",
      params: { title, reason: "repost" },
      confidence: 0.95,
      display: `Repost "${title}"`,
    };
  }

  return null; // No quick match — fall through to AI
}
