import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/lib/constants/roles";

/**
 * Authenticated session with org context from JWT claims.
 * Claims injected by custom_access_token_hook() in migration 001/017.
 */
export interface Session {
  userId: string;
  orgId: string;
  orgRole: OrgRole;
  plan: string;
  featureFlags: Record<string, boolean>;
}

/**
 * Extract org claims from the JWT access token.
 *
 * The custom_access_token_hook injects org_id, org_role, plan, and
 * feature_flags into the JWT claims. These are NOT in app_metadata
 * (which is what getUser() returns from the DB). They're only in the
 * decoded JWT, which getSession() provides.
 *
 * We use getUser() for auth verification (server-side JWT validation),
 * then getSession() to read the hook-injected claims.
 */
export function extractSession(
  userId: string,
  jwtClaims: Record<string, unknown>,
): Session {
  return {
    userId,
    orgId: (jwtClaims.org_id as string) ?? "",
    orgRole: ((jwtClaims.org_role as string) ?? "interviewer") as OrgRole,
    plan: (jwtClaims.plan as string) ?? "starter",
    featureFlags: (jwtClaims.feature_flags as Record<string, boolean>) ?? {},
  };
}

/**
 * Require an authenticated user with org context.
 * Redirects to /login if no session. Use in Server Components + Server Actions.
 *
 * Two-step auth: getUser() validates JWT server-side (secure),
 * getSession() reads decoded JWT claims (has hook-injected org data).
 */
export async function requireAuth(): Promise<Session> {
  const supabase = await createClient();

  // Step 1: Verify auth (server-side JWT validation)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Step 2: Read JWT claims (contains hook-injected org_id, org_role, etc.)
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();

  const jwtClaims = authSession?.access_token
    ? decodeJwtPayload(authSession.access_token)
    : {};

  return extractSession(user.id, jwtClaims);
}

/**
 * Require auth + specific role(s). Redirects to /login if not authenticated,
 * throws 403 if role doesn't match.
 */
export async function requireRole(
  ...roles: OrgRole[]
): Promise<Session> {
  const session = await requireAuth();

  if (!roles.includes(session.orgRole)) {
    throw new Error("Insufficient permissions");
  }

  return session;
}

/**
 * Get session without redirecting — returns null if not authenticated.
 * Use for conditional UI rendering.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();

  const jwtClaims = authSession?.access_token
    ? decodeJwtPayload(authSession.access_token)
    : {};

  return extractSession(user.id, jwtClaims);
}

/**
 * Decode the payload of a JWT without verification.
 * Verification is already done by getUser() — this just reads claims.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split(".");
    const encodedPayload = parts[1];
    if (parts.length !== 3 || !encodedPayload) return {};
    const payload = Buffer.from(encodedPayload, "base64url").toString("utf-8");
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return {};
  }
}
