import { generateObject } from "ai";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { chatModel, AI_MODELS } from "@/lib/ai/client";
import { consumeAiCredits, logAiUsage } from "@/lib/ai/credits";

/**
 * analytics/generate-briefing
 *
 * Generates and caches a daily AI briefing for an org.
 * Cache-first: skips OpenAI if today's row already exists in org_daily_briefings.
 * Triggered on-demand via `ats/analytics.briefing-requested` event.
 * Concurrency limited to 1 per org to prevent duplicate generation.
 *
 * Briefing format: { win, blocker, action }
 * Model: gpt-4o-mini (fast tier — structured output, low latency)
 */

const briefingSchema = z.object({
  win: z.string().describe("One concrete positive signal from today's pipeline data"),
  blocker: z.string().describe("One bottleneck or risk that needs attention"),
  action: z.string().describe("One specific, actionable next step for the recruiting team"),
});

export type DailyBriefingContent = z.infer<typeof briefingSchema>;

export function isBriefingContent(val: unknown): val is DailyBriefingContent {
  const result = briefingSchema.safeParse(val);
  return result.success;
}

export const generateDailyBriefing = inngest.createFunction(
  {
    id: "analytics-generate-briefing",
    name: "Analytics: Generate Daily Briefing",
    concurrency: {
      key: "event.data.orgId",
      limit: 1,
    },
  },
  { event: "ats/analytics.briefing-requested" },
  async ({ event, step }) => {
    const { orgId, triggeredBy, force } = event.data as {
      orgId: string;
      triggeredBy?: string;
      force?: boolean;
    };
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // ── Step 1: Cache check (skip when force=true) ───────
    if (!force) {
      const cached = await step.run("check-cache", async () => {
        const supabase = createServiceClient();
        const { data } = await supabase
          .from("org_daily_briefings")
          .select("id, content")
          .eq("organization_id", orgId)
          .eq("briefing_date", today)
          .is("deleted_at", null)
          .maybeSingle();
        return data;
      });

      if (cached) {
        return { cached: true, briefingId: cached.id };
      }
    }

    // ── Step 2: Fetch pipeline snapshot ─────────────────
    const snapshot = await step.run("fetch-snapshot", async () => {
      const supabase = createServiceClient();
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [
        { count: openJobs },
        { count: activeApps },
        { count: hiresThisMonth },
        { data: atRiskRows },
      ] = await Promise.all([
        supabase
          .from("job_openings")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "open")
          .is("deleted_at", null),

        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "active")
          .is("deleted_at", null),

        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "hired")
          .gte("hired_at", startOfMonth)
          .is("deleted_at", null),

        // At-risk job titles: open >21 days, <3 active apps
        supabase
          .from("job_openings")
          .select("title, created_at, published_at")
          .eq("organization_id", orgId)
          .eq("status", "open")
          .is("deleted_at", null)
          .limit(10),
      ]);

      return {
        openJobs: openJobs ?? 0,
        activeApps: activeApps ?? 0,
        hiresThisMonth: hiresThisMonth ?? 0,
        atRiskTitles: (atRiskRows ?? [])
          .filter((j) => {
            const openedAt = j.published_at ?? j.created_at;
            const daysOpen = (Date.now() - new Date(openedAt).getTime()) / 86400000;
            return daysOpen >= 21;
          })
          .map((j) => j.title)
          .slice(0, 3),
      };
    });

    // ── Step 3: Credit check ─────────────────────────────
    const credited = await step.run("consume-credits", async () => {
      return consumeAiCredits(orgId, "daily_briefing");
    });

    if (!credited) {
      await step.run("log-skipped", async () => {
        await logAiUsage({
          organizationId: orgId,
          userId: triggeredBy,
          action: "daily_briefing",
          model: AI_MODELS.fast,
          status: "skipped",
          errorMessage: "Insufficient AI credits",
        });
      });
      return { cached: false, skipped: true, reason: "insufficient_credits" };
    }

    // ── Step 4: Call OpenAI ──────────────────────────────
    const { content, usage, latencyMs } = await step.run("call-openai", async () => {
      const prompt = [
        `You are a recruiting operations assistant generating a daily briefing for a staffing team.`,
        ``,
        `Today's pipeline snapshot:`,
        `- Open jobs: ${snapshot.openJobs}`,
        `- Active applications in pipeline: ${snapshot.activeApps}`,
        `- Hires this month: ${snapshot.hiresThisMonth}`,
        snapshot.atRiskTitles.length > 0
          ? `- Jobs open >21 days (at-risk): ${snapshot.atRiskTitles.join(", ")}`
          : `- No jobs at risk (all recently active)`,
        ``,
        `Generate a concise daily briefing with exactly one win, one blocker, and one action item.`,
        `Keep each field under 120 characters. Be specific, not generic.`,
      ].join("\n");

      const startMs = Date.now();
      const { object, usage: u } = await generateObject({
        model: chatModel,
        schema: briefingSchema,
        prompt,
      });

      return {
        content: object,
        usage: u,
        latencyMs: Date.now() - startMs,
      };
    });

    // ── Step 5: Upsert to cache ──────────────────────────
    const briefingId = await step.run("upsert-cache", async () => {
      const supabase = createServiceClient();
      const id = crypto.randomUUID();

      const { error } = await supabase.from("org_daily_briefings").upsert(
        {
          id,
          organization_id: orgId,
          briefing_date: today,
          content,
          generated_by: triggeredBy ?? null,
          model: AI_MODELS.fast,
          prompt_tokens: usage?.inputTokens,
          completion_tokens: usage?.outputTokens,
        },
        { onConflict: "organization_id,briefing_date" }
      );

      if (error) throw error;
      return id;
    });

    // ── Step 6: Log AI usage ─────────────────────────────
    await step.run("log-usage", async () => {
      await logAiUsage({
        organizationId: orgId,
        userId: triggeredBy,
        action: "daily_briefing",
        model: AI_MODELS.fast,
        tokensInput: usage?.inputTokens,
        tokensOutput: usage?.outputTokens,
        latencyMs,
        status: "success",
      });
    });

    return { cached: false, briefingId };
  }
);

// Re-export for use in error handlers
export { generateDailyBriefing as analyticsGenerateBriefing };
