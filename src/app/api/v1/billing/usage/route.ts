import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireRoleAPI } from "@/lib/auth/api";
import { problemResponse } from "@/lib/utils/problem";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/billing/usage (D03 §9)
 *
 * Returns current-period AI credit usage with per-action breakdown.
 * Owner or admin only.
 */
export async function GET() {
  const { session, error } = await requireRoleAPI("owner", "admin");
  if (error) return error;

  try {
    const supabase = createServiceClient();

    // Get org credits
    const { data: org } = await supabase
      .from("organizations")
      .select("ai_credits_used, ai_credits_limit")
      .eq("id", session.orgId)
      .is("deleted_at", null)
      .single();

    if (!org) {
      return problemResponse(404, "ATS-BI02", "Organization not found");
    }

    // Get per-action usage for current period
    // We approximate "current period" as current calendar month
    const periodStart = new Date();
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

    const { data: usageLogs } = await supabase
      .from("ai_usage_logs")
      .select("action, credits_used")
      .eq("organization_id", session.orgId)
      .gte("created_at", periodStart.toISOString())
      .lt("created_at", periodEnd.toISOString());

    // Aggregate by action
    const actionMap = new Map<string, { count: number; total_cost_cents: number }>();
    for (const log of usageLogs ?? []) {
      const existing = actionMap.get(log.action) ?? { count: 0, total_cost_cents: 0 };
      existing.count += 1;
      existing.total_cost_cents += (log.credits_used ?? 0) * 5; // $0.05 per credit
      actionMap.set(log.action, existing);
    }

    const usageByAction = Array.from(actionMap.entries()).map(([action, stats]) => ({
      action,
      count: stats.count,
      total_cost_cents: stats.total_cost_cents,
    }));

    return NextResponse.json({
      ai_credits_used: org.ai_credits_used,
      ai_credits_limit: org.ai_credits_limit,
      ai_credits_remaining: Math.max(0, org.ai_credits_limit - org.ai_credits_used),
      usage_by_action: usageByAction,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    });
  } catch (err) {
    Sentry.captureException(err);
    return problemResponse(500, "ATS-BI06", "Failed to fetch usage data");
  }
}
