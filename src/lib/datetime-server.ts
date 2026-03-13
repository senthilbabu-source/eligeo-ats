/**
 * Server-only timezone utilities.
 * Re-exports everything from datetime.ts + adds getUserTimezone (requires Supabase server client).
 */

export { formatInTz, formatForEmail, localInputToUtc, resolveTimezone, COMMON_TIMEZONES } from "./datetime";

import { createClient } from "@/lib/supabase/server";
import { resolveTimezone } from "./datetime";

/**
 * Fetch the effective timezone for the current user from DB.
 * Use in Server Components / Server Actions (reads Supabase cookies).
 * Returns resolved IANA timezone string.
 */
export async function getUserTimezone(userId: string, orgId: string): Promise<string> {
  const supabase = await createClient();

  const [{ data: profile }, { data: org }] = await Promise.all([
    supabase.from("user_profiles").select("timezone").eq("id", userId).single(),
    supabase.from("organizations").select("timezone").eq("id", orgId).single(),
  ]);

  return resolveTimezone(profile?.timezone, org?.timezone);
}
