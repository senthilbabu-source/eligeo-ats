import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/lib/constants/roles";
import type { Session } from "./session";

/**
 * Extract org claims from Supabase JWT app_metadata.
 */
function extractSession(user: {
  id: string;
  app_metadata?: Record<string, unknown>;
}): Session {
  const meta = user.app_metadata ?? {};
  return {
    userId: user.id,
    orgId: (meta.org_id as string) ?? "",
    orgRole: ((meta.org_role as string) ?? "interviewer") as OrgRole,
    plan: (meta.plan as string) ?? "starter",
    featureFlags: (meta.feature_flags as Record<string, boolean>) ?? {},
  };
}

type AuthResult =
  | { session: Session; error: null }
  | { session: null; error: NextResponse };

/**
 * Require auth in API Route Handlers.
 * Returns error response (not redirect) for unauthenticated requests.
 *
 * Usage:
 *   const { session, error } = await requireAuthAPI();
 *   if (error) return error;
 */
export async function requireAuthAPI(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      session: null,
      error: NextResponse.json(
        { code: "ATS-AU01", message: "Authentication required" },
        { status: 401 },
      ),
    };
  }

  return { session: extractSession(user), error: null };
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
      error: NextResponse.json(
        { code: "ATS-AU04", message: "Insufficient permissions" },
        { status: 403 },
      ),
    };
  }

  return result;
}
