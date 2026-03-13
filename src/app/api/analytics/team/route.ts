import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireAuthAPI } from "@/lib/auth/api";
import { can } from "@/lib/constants/roles";
import { problemResponse } from "@/lib/utils/problem";
import { fetchAnalyticsRawData, parseDateRange } from "@/lib/analytics/fetch";
import { computeTeamAnalytics } from "@/lib/analytics/compute";

/**
 * GET /api/analytics/team
 * Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns TeamSnapshot.
 * Owner/admin only — requires reports:view permission.
 * D33 §7
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuthAPI();
  if (error) return error;

  if (!can(session.orgRole, "reports:view")) {
    return problemResponse(403, "ATS-AN03", "Team analytics requires admin access");
  }

  try {
    const dateRange = parseDateRange(req.nextUrl.searchParams);
    const raw = await fetchAnalyticsRawData(session.orgId, dateRange);

    const team = computeTeamAnalytics({
      jobs: raw.jobs,
      applications: raw.applications,
      interviews: raw.interviews,
      scorecards: raw.scorecards,
      profiles: raw.profiles,
      dateRange,
    });

    return NextResponse.json(team);
  } catch (err) {
    Sentry.captureException(err);
    return problemResponse(500, "ATS-AN02", "Failed to compute team analytics");
  }
}
