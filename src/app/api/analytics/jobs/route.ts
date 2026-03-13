import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireAuthAPI } from "@/lib/auth/api";
import { can } from "@/lib/constants/roles";
import { problemResponse } from "@/lib/utils/problem";
import { fetchAnalyticsRawData, parseDateRange } from "@/lib/analytics/fetch";
import { computeJobAnalytics } from "@/lib/analytics/compute";

/**
 * GET /api/analytics/jobs
 * Returns JobSnapshot for all currently open jobs.
 * D33 §7
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuthAPI();
  if (error) return error;

  if (!can(session.orgRole, "analytics:view")) {
    return problemResponse(403, "ATS-AN01", "Insufficient permissions for analytics");
  }

  try {
    const dateRange = parseDateRange(req.nextUrl.searchParams);
    const raw = await fetchAnalyticsRawData(session.orgId, dateRange);

    const jobs = computeJobAnalytics({
      jobs: raw.jobs,
      applications: raw.applications,
      stageHistory: raw.stageHistory,
      offers: raw.offers,
      dateRange,
    });

    return NextResponse.json(jobs);
  } catch (err) {
    Sentry.captureException(err);
    return problemResponse(500, "ATS-AN02", "Failed to compute job analytics");
  }
}
