import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireAuthAPI } from "@/lib/auth/api";
import { can } from "@/lib/constants/roles";
import { problemResponse } from "@/lib/utils/problem";
import { fetchAnalyticsRawData, parseDateRange } from "@/lib/analytics/fetch";
import { computeSourceAnalytics } from "@/lib/analytics/compute";

/**
 * GET /api/analytics/sources
 * Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns SourceSnapshot.
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

    const sources = computeSourceAnalytics({
      applications: raw.applications,
      candidates: raw.candidates,
      sources: raw.sources,
      dateRange,
    });

    return NextResponse.json(sources);
  } catch (err) {
    Sentry.captureException(err);
    return problemResponse(500, "ATS-AN02", "Failed to compute source analytics");
  }
}
