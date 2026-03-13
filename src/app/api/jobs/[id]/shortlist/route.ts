import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

/**
 * POST /api/jobs/[id]/shortlist
 * Trigger AI batch shortlisting for a job.
 * 24-hour dedup: returns existing report if one completed < 24h ago.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  if (!can(session.orgRole, "jobs:edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: jobId } = await params;
  const supabase = await createClient();

  // Check 24-hour dedup
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("ai_shortlist_reports")
    .select("id, status, completed_at")
    .eq("job_opening_id", jobId)
    .eq("organization_id", session.orgId)
    .eq("status", "complete")
    .gte("completed_at", twentyFourHoursAgo)
    .is("deleted_at", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ reportId: existing.id, existing: true });
  }

  // Check for in-progress report
  const { data: pending } = await supabase
    .from("ai_shortlist_reports")
    .select("id, status")
    .eq("job_opening_id", jobId)
    .eq("organization_id", session.orgId)
    .in("status", ["pending", "processing"])
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (pending) {
    return NextResponse.json({ reportId: pending.id, existing: true, status: pending.status });
  }

  // Create new report
  const { data: report, error } = await supabase
    .from("ai_shortlist_reports")
    .insert({
      organization_id: session.orgId,
      job_opening_id: jobId,
      triggered_by: session.userId,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !report) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create report" },
      { status: 500 },
    );
  }

  // Fire Inngest event
  await inngest.send({
    name: "jobs/shortlist.requested",
    data: {
      jobId,
      reportId: report.id,
      orgId: session.orgId,
      triggeredBy: session.userId,
    },
  });

  return NextResponse.json({ reportId: report.id, existing: false });
}
