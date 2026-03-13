import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/jobs/[id]/shortlist/override
 * Override AI tier classification for a candidate in a shortlist report.
 * Logged to audit_logs via ADR-007 trigger.
 */
export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (!can(session.orgRole, "jobs:edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { candidateRowId, newTier } = await req.json();

  if (!candidateRowId || !["shortlist", "hold", "reject"].includes(newTier)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("ai_shortlist_candidates")
    .update({
      recruiter_tier: newTier,
      tier_overridden_at: new Date().toISOString(),
      tier_overridden_by: session.userId,
    })
    .eq("id", candidateRowId)
    .eq("organization_id", session.orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
