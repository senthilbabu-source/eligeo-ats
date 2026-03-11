import { NextResponse } from "next/server";

/**
 * RFC 9457 Problem Details response helper.
 * Used in API Route Handlers for standardized error responses.
 * See D26 Error Taxonomy for the full code catalog.
 */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  instance?: string;
  trace_id?: string;
}

/**
 * Create an RFC 9457 error response.
 *
 * Usage:
 *   return problemResponse(401, "ATS-AU01", "Authentication required");
 *   return problemResponse(403, "ATS-AU04", "Insufficient permissions", "You need admin role.");
 */
export function problemResponse(
  status: number,
  code: string,
  title: string,
  detail?: string,
): NextResponse<ProblemDetail> {
  return NextResponse.json(
    {
      type: `https://eligeo.io/errors/${code.toLowerCase()}`,
      title,
      status,
      code,
      ...(detail && { detail }),
    },
    {
      status,
      headers: { "Content-Type": "application/problem+json" },
    },
  );
}
