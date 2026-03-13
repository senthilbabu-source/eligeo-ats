/**
 * Timezone-aware date formatting utilities.
 * Uses @date-fns/tz (TZDate) for IANA timezone conversions.
 *
 * All timestamps in the database are TIMESTAMPTZ (UTC).
 * This module converts UTC → user/org timezone for display.
 */

import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

// ── Formatting ─────────────────────────────────────────────

/**
 * Format a UTC date string/Date in a specific IANA timezone.
 *
 * Styles:
 * - "short"    → "Mar 18, 2026"
 * - "long"     → "Tuesday, March 18, 2026"
 * - "datetime" → "Mar 18, 2026 at 2:00 PM EDT"
 * - "time"     → "2:00 PM EDT"
 */
export function formatInTz(
  date: Date | string | null | undefined,
  timezone: string,
  style: "short" | "long" | "datetime" | "time" = "short",
): string {
  if (!date) return "—";
  const tzDate = new TZDate(typeof date === "string" ? new Date(date) : date, timezone);

  switch (style) {
    case "short":
      return format(tzDate, "MMM d, yyyy");
    case "long":
      return format(tzDate, "EEEE, MMMM d, yyyy");
    case "datetime":
      return `${format(tzDate, "MMM d, yyyy 'at' h:mm a")} ${tzAbbrev(tzDate, timezone)}`;
    case "time":
      return `${format(tzDate, "h:mm a")} ${tzAbbrev(tzDate, timezone)}`;
  }
}

/**
 * Format for emails: dual timezone display.
 * e.g., "Tue, Mar 18, 2026 at 10:00 AM IST (4:30 AM UTC)"
 */
export function formatForEmail(
  date: Date | string | null | undefined,
  recipientTz: string,
): string {
  if (!date) return "TBD";
  const d = typeof date === "string" ? new Date(date) : date;
  const tzDate = new TZDate(d, recipientTz);
  const utcDate = new TZDate(d, "UTC");

  const local = `${format(tzDate, "EEE, MMM d, yyyy 'at' h:mm a")} ${tzAbbrev(tzDate, recipientTz)}`;

  // If recipient is already in UTC, skip the duplicate
  if (recipientTz === "UTC") return local;

  const utc = format(utcDate, "h:mm a");
  return `${local} (${utc} UTC)`;
}

// ── Input conversion ───────────────────────────────────────

/**
 * Convert an HTML datetime-local input value to a UTC Date.
 * datetime-local gives "2026-03-18T14:00" (no timezone info).
 * We interpret it as being in the source timezone and convert to UTC.
 */
export function localInputToUtc(
  localDateTimeString: string,
  sourceTz: string,
): Date {
  // Parse the datetime-local string components (no timezone info in the string)
  const [datePart, timePart] = localDateTimeString.split("T");
  if (!datePart || !timePart) return new Date(localDateTimeString);
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  if (year == null || month == null || day == null || hours == null || minutes == null) {
    return new Date(localDateTimeString);
  }
  // Construct a TZDate in the source timezone — this correctly computes the UTC offset
  const tzDate = TZDate.tz(sourceTz, year, month - 1, day, hours, minutes);
  return new Date(tzDate.getTime());
}

// ── Resolution ─────────────────────────────────────────────

/**
 * Resolve the effective timezone for a user.
 * Priority: user preference > org default > UTC
 */
export function resolveTimezone(
  userTz: string | null | undefined,
  orgTz: string | null | undefined,
): string {
  if (userTz && userTz !== "UTC" && isValidTimezone(userTz)) return userTz;
  if (orgTz && isValidTimezone(orgTz)) return orgTz;
  return "UTC";
}

// getUserTimezone is server-only — import from "@/lib/datetime-server"

// ── Helpers ────────────────────────────────────────────────

/**
 * Get the timezone abbreviation (e.g., "EST", "IST", "PDT") for a date in a timezone.
 */
function tzAbbrev(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timezone;
  } catch {
    return timezone;
  }
}

/**
 * Validate an IANA timezone string.
 */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ── Common IANA timezones for UI selector ──────────────────

export const COMMON_TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "America/Toronto", label: "Eastern Time — Canada" },
  { value: "America/Vancouver", label: "Pacific Time — Canada" },
  { value: "America/Sao_Paulo", label: "Brasilia Time (BRT)" },
  { value: "America/Mexico_City", label: "Central Time — Mexico" },
  { value: "Europe/London", label: "Greenwich Mean Time (GMT)" },
  { value: "Europe/Paris", label: "Central European Time (CET)" },
  { value: "Europe/Berlin", label: "Central European Time — Germany" },
  { value: "Europe/Amsterdam", label: "Central European Time — Netherlands" },
  { value: "Europe/Helsinki", label: "Eastern European Time (EET)" },
  { value: "Europe/Moscow", label: "Moscow Time (MSK)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (GST)" },
  { value: "Asia/Kolkata", label: "India Standard Time (IST)" },
  { value: "Asia/Dhaka", label: "Bangladesh Standard Time (BST)" },
  { value: "Asia/Bangkok", label: "Indochina Time (ICT)" },
  { value: "Asia/Singapore", label: "Singapore Time (SGT)" },
  { value: "Asia/Shanghai", label: "China Standard Time (CST)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST)" },
  { value: "Asia/Seoul", label: "Korea Standard Time (KST)" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (AET)" },
  { value: "Australia/Perth", label: "Australian Western Time (AWT)" },
  { value: "Pacific/Auckland", label: "New Zealand Time (NZT)" },
  { value: "Africa/Lagos", label: "West Africa Time (WAT)" },
  { value: "Africa/Nairobi", label: "East Africa Time (EAT)" },
  { value: "Africa/Johannesburg", label: "South Africa Standard Time (SAST)" },
] as const;
