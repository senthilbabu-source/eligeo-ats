import { describe, it, expect } from "vitest";
import { formatInTz, formatForEmail, localInputToUtc, resolveTimezone } from "@/lib/datetime";

describe("formatInTz", () => {
  // 2026-03-18T18:00:00Z = 2:00 PM EDT (UTC-4) = 11:30 PM IST (UTC+5:30)
  const utcIso = "2026-03-18T18:00:00Z";

  it("should format short date in America/New_York", () => {
    const result = formatInTz(utcIso, "America/New_York", "short");
    expect(result).toBe("Mar 18, 2026");
  });

  it("should format long date in America/New_York", () => {
    const result = formatInTz(utcIso, "America/New_York", "long");
    expect(result).toBe("Wednesday, March 18, 2026");
  });

  it("should format datetime with timezone abbreviation in America/New_York", () => {
    const result = formatInTz(utcIso, "America/New_York", "datetime");
    // March 18 2026 is during EDT (daylight saving)
    expect(result).toContain("Mar 18, 2026 at 2:00 PM");
    expect(result).toContain("EDT");
  });

  it("should format datetime in Asia/Kolkata (+5:30 offset)", () => {
    const result = formatInTz(utcIso, "Asia/Kolkata", "datetime");
    // 18:00 UTC = 23:30 IST = 11:30 PM
    expect(result).toContain("11:30 PM");
    // Node.js may show "IST" or "GMT+5:30" depending on environment
    expect(result).toMatch(/IST|GMT\+5:30/);
  });

  it("should format time-only style", () => {
    const result = formatInTz(utcIso, "America/New_York", "time");
    expect(result).toContain("2:00 PM");
    expect(result).toContain("EDT");
  });

  it("should return dash for null date", () => {
    expect(formatInTz(null, "America/New_York", "short")).toBe("—");
    expect(formatInTz(undefined, "UTC", "datetime")).toBe("—");
  });

  it("should handle UTC timezone", () => {
    const result = formatInTz(utcIso, "UTC", "datetime");
    expect(result).toContain("6:00 PM");
    expect(result).toContain("UTC");
  });
});

describe("formatForEmail", () => {
  const utcIso = "2026-03-18T18:00:00Z";

  it("should show dual timezone for non-UTC recipient", () => {
    const result = formatForEmail(utcIso, "America/New_York");
    // Should contain local time + UTC in parentheses
    expect(result).toContain("2:00 PM");
    expect(result).toContain("EDT");
    expect(result).toContain("(6:00 PM UTC)");
  });

  it("should not duplicate UTC for UTC recipient", () => {
    const result = formatForEmail(utcIso, "UTC");
    expect(result).toContain("6:00 PM");
    expect(result).not.toContain("(");
  });

  it("should return TBD for null date", () => {
    expect(formatForEmail(null, "America/New_York")).toBe("TBD");
  });
});

describe("localInputToUtc", () => {
  it("should convert EST local input to UTC", () => {
    // "2:00 PM" in New York (EDT, UTC-4) = 6:00 PM UTC
    const utc = localInputToUtc("2026-03-18T14:00", "America/New_York");
    expect(utc.toISOString()).toBe("2026-03-18T18:00:00.000Z");
  });

  it("should convert IST local input to UTC", () => {
    // "11:30 PM" in Kolkata (IST, UTC+5:30) = 6:00 PM UTC
    const utc = localInputToUtc("2026-03-18T23:30", "Asia/Kolkata");
    expect(utc.toISOString()).toBe("2026-03-18T18:00:00.000Z");
  });

  it("should handle UTC input as-is", () => {
    const utc = localInputToUtc("2026-03-18T18:00", "UTC");
    expect(utc.toISOString()).toBe("2026-03-18T18:00:00.000Z");
  });
});

describe("resolveTimezone", () => {
  it("should prefer user timezone over org", () => {
    expect(resolveTimezone("America/New_York", "Asia/Kolkata")).toBe("America/New_York");
  });

  it("should fall back to org timezone when user is null", () => {
    expect(resolveTimezone(null, "Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("should fall back to org timezone when user is undefined", () => {
    expect(resolveTimezone(undefined, "Europe/London")).toBe("Europe/London");
  });

  it("should fall back to UTC when both are null", () => {
    expect(resolveTimezone(null, null)).toBe("UTC");
  });

  it("should fall back to org when user timezone is UTC (default/unset)", () => {
    expect(resolveTimezone("UTC", "Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("should return UTC when org is also UTC", () => {
    expect(resolveTimezone("UTC", "UTC")).toBe("UTC");
  });
});
