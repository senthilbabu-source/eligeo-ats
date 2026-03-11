import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/lib/constants/roles";

/**
 * Authenticated session with org context from JWT claims.
 * Claims injected by custom_access_token_hook() in migration 001.
 */
export interface Session {
  userId: string;
  orgId: string;
  orgRole: OrgRole;
  plan: string;
  featureFlags: Record<string, boolean>;
}

/**
 * Extract org claims from Supabase JWT app_metadata.
 * The custom_access_token_hook injects these into the access token.
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

/**
 * Require an authenticated user with org context.
 * Redirects to /login if no session. Use in Server Components + Server Actions.
 */
export async function requireAuth(): Promise<Session> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return extractSession(user);
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

  return extractSession(user);
}
