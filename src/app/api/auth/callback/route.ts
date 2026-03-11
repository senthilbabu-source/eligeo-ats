import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Validate redirect path to prevent open redirect attacks.
 * Only allows relative paths starting with / that don't escape to external domains.
 */
function getSafeRedirectPath(raw: string | null): string {
  const fallback = "/dashboard";
  if (!raw) return fallback;

  // Must start with exactly one slash (not // which browsers treat as protocol-relative)
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;

  // Block encoded slashes and backslashes that could bypass the check
  if (raw.includes("\\") || raw.includes("%2f") || raw.includes("%2F")) return fallback;

  return raw;
}

/**
 * Supabase Auth callback handler.
 * Exchanges auth code for session after OAuth/magic link flows.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectPath = getSafeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${redirectPath}`);
    }
  }

  // Auth error — redirect to login with error indicator
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
