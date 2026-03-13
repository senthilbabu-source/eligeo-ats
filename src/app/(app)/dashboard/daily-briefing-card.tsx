import { createClient } from "@/lib/supabase/server";
import { regenerateBriefing } from "@/lib/actions/dashboard";
import { isBriefingContent } from "@/inngest/functions/analytics/generate-briefing";
import { formatInTz } from "@/lib/datetime";

/**
 * DailyBriefingCard — R11
 *
 * Server component. Fetches today's cached briefing from org_daily_briefings.
 * Wrapped in <Suspense> in dashboard/page.tsx for streaming.
 *
 * Admin/owner users see a "Regenerate" button that triggers the Inngest function.
 */

async function RegenerateButton() {
  return (
    <form action={regenerateBriefing}>
      <button
        type="submit"
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
      >
        Regenerate
      </button>
    </form>
  );
}

export async function DailyBriefingCard({
  orgId,
  isAdmin,
  timezone,
}: {
  orgId: string;
  isAdmin: boolean;
  timezone: string;
}) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: briefing } = await supabase
    .from("org_daily_briefings")
    .select("id, content, generated_at")
    .eq("organization_id", orgId)
    .eq("briefing_date", today)
    .is("deleted_at", null)
    .maybeSingle();

  // No briefing for today yet
  if (!briefing || !isBriefingContent(briefing.content)) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Daily Briefing</p>
          {isAdmin && <RegenerateButton />}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          No briefing yet for today. {isAdmin ? "Click Regenerate to generate one." : "Check back soon."}
        </p>
      </div>
    );
  }

  const { win, blocker, action } = briefing.content;
  const generatedAt = formatInTz(briefing.generated_at, timezone, "time");

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Daily Briefing</p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground/60">generated {generatedAt}</span>
          {isAdmin && <RegenerateButton />}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Win */}
        <div className="rounded-md bg-success/10 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-success">Win</p>
          <p className="text-sm text-foreground">{win}</p>
        </div>

        {/* Blocker */}
        <div className="rounded-md bg-warning/10 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-warning">Blocker</p>
          <p className="text-sm text-foreground">{blocker}</p>
        </div>

        {/* Action */}
        <div className="rounded-md bg-primary/10 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">Action</p>
          <p className="text-sm text-foreground">{action}</p>
        </div>
      </div>
    </div>
  );
}
