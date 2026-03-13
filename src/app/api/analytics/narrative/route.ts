import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireAuthAPI } from "@/lib/auth/api";
import { can } from "@/lib/constants/roles";
import { problemResponse } from "@/lib/utils/problem";
import { generateAnalyticsNarrative } from "@/lib/ai/generate";

/**
 * POST /api/analytics/narrative
 * Body: { view, currentPeriod, previousPeriod, orgContext }
 * Returns AI-generated narrative for an analytics view.
 * Rate limited: 10 calls/minute per org (future — for now, AI credit gating).
 * D33 §7
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuthAPI();
  if (error) return error;

  if (!can(session.orgRole, "analytics:view")) {
    return problemResponse(403, "ATS-AN01", "Insufficient permissions for analytics");
  }

  try {
    const body = await req.json();
    const { view, currentPeriod, previousPeriod, orgContext } = body;

    if (!view || !currentPeriod) {
      return problemResponse(400, "ATS-AN04", "Missing required fields: view, currentPeriod");
    }

    const validViews = ["funnel", "velocity", "source", "team", "jobs"];
    if (!validViews.includes(view)) {
      return problemResponse(400, "ATS-AN05", `Invalid view: ${view}. Must be one of: ${validViews.join(", ")}`);
    }

    const result = await generateAnalyticsNarrative({
      view,
      currentPeriod,
      previousPeriod: previousPeriod ?? null,
      orgContext: orgContext ?? { totalOpenJobs: 0, teamSize: 0, avgTimeToHire: 0 },
      organizationId: session.orgId,
      userId: session.userId,
    });

    if (result.error) {
      return problemResponse(422, "ATS-AN06", result.error);
    }

    return NextResponse.json(result);
  } catch (err) {
    Sentry.captureException(err);
    return problemResponse(500, "ATS-AN02", "Failed to generate analytics narrative");
  }
}
