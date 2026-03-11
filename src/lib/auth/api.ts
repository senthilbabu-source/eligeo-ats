import type { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/lib/constants/roles";
import { problemResponse } from "@/lib/utils/problem";
import type { ProblemDetail } from "@/lib/utils/problem";
import { extractSession, decodeJwtPayload } from "./session";
import type { Session } from "./session";

type AuthResult =
  | { session: Session; error: null }
  | { session: null; error: NextResponse<ProblemDetail> };

/**
 * Require auth in API Route Handlers.
 * Returns RFC 9457 error response (not redirect) for unauthenticated requests.
 *
 * Two-step auth: getUser() validates JWT server-side (secure),
 * getSession() reads decoded JWT claims (has hook-injected org data).
 *
 * Usage:
 *   const { session, error } = await requireAuthAPI();
 *   if (error) return error;
 */
export async function requireAuthAPI(): Promise<AuthResult> {
  const supabase = await createClient();

  // Step 1: Verify auth (server-side JWT validation)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      session: null,
      error: problemResponse(401, "ATS-AU01", "Authentication required"),
    };
  }

  // Step 2: Read JWT claims (contains hook-injected org_id, org_role, etc.)
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();

  const jwtClaims = authSession?.access_token
    ? decodeJwtPayload(authSession.access_token)
    : {};

  return { session: extractSession(user.id, jwtClaims), error: null };
}

/**
 * Require auth + specific role(s) in API Route Handlers.
 */
export async function requireRoleAPI(
  ...roles: OrgRole[]
): Promise<AuthResult> {
  const result = await requireAuthAPI();
  if (result.error) return result;

  if (!roles.includes(result.session.orgRole)) {
    return {
      session: null,
      error: problemResponse(403, "ATS-AU04", "Insufficient permissions"),
    };
  }

  return result;
}
