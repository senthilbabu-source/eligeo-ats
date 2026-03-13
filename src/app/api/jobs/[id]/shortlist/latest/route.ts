import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/jobs/[id]/shortlist/latest
 * Returns most recent shortlist report for a job (status, counts, completedAt).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  const { id: jobId } = await params;
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("ai_shortlist_reports")
    .select(
      "id, status, total_applications, shortlist_count, hold_count, reject_count, insufficient_data_count, completed_at, created_at",
    )
    .eq("job_opening_id", jobId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ report: null });
  }

  return NextResponse.json({ report });
}
