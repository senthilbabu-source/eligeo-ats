import { createServiceClient } from "@/lib/supabase/server";

/**
 * AI credit weights per action type.
 * Defined in D10 §6.4 — differentiated by computational cost.
 */
const CREDIT_WEIGHTS: Record<string, number> = {
  resume_parse: 2,
  candidate_match: 1,
  job_description_generate: 3,
  email_draft: 1,
  feedback_summarize: 1,
  nl_intent: 1,
  bias_check: 1,
  title_suggestion: 1,
  skills_delta: 1,
  daily_briefing: 1,
  offer_compensation_suggest: 2,
  offer_letter_draft: 2,
  offer_salary_check: 1,
  match_explanation: 1,
};

export type AiAction = keyof typeof CREDIT_WEIGHTS;

/**
 * Atomically consume AI credits for an organization.
 * Returns true if credits were available and consumed, false otherwise.
 * Uses the `consume_ai_credits()` SQL function (migration 015).
 */
export async function consumeAiCredits(
  orgId: string,
  action: string,
): Promise<boolean> {
  const weight = CREDIT_WEIGHTS[action] ?? 1;
  const supabase = createServiceClient();

  const { data } = await supabase.rpc("consume_ai_credits", {
    p_org_id: orgId,
    p_amount: weight,
  });

  return data !== null;
}

/**
 * Log an AI operation for billing, audit, and debugging.
 * Always logs — even failures and skipped operations.
 */
export async function logAiUsage(params: {
  organizationId: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  model?: string;
  tokensInput?: number;
  tokensOutput?: number;
  latencyMs?: number;
  status: "success" | "error" | "skipped";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceClient();
  const weight = CREDIT_WEIGHTS[params.action] ?? 1;

  await supabase.from("ai_usage_logs").insert({
    organization_id: params.organizationId,
    user_id: params.userId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    credits_used: params.status === "success" ? weight : 0,
    model: params.model,
    tokens_input: params.tokensInput,
    tokens_output: params.tokensOutput,
    latency_ms: params.latencyMs,
    status: params.status,
    error_message: params.errorMessage,
    metadata: params.metadata ?? {},
  });
}

/**
 * Get remaining AI credits for an organization.
 */
export async function getRemainingCredits(
  orgId: string,
): Promise<{ used: number; limit: number; remaining: number }> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("organizations")
    .select("ai_credits_used, ai_credits_limit")
    .eq("id", orgId)
    .single();

  const used = data?.ai_credits_used ?? 0;
  const limit = data?.ai_credits_limit ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}
