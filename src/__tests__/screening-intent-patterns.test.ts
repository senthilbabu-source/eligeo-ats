import { describe, it, expect } from "vitest";

/**
 * P6-4: Screening Intent Quick Pattern Tests
 *
 * Tests for the quick pattern matching in intent.ts for screening intents.
 * Since matchQuickPatterns is not exported, we test the regex patterns directly.
 * IMPORTANT: Keep these in sync with src/lib/ai/intent.ts matchQuickPatterns.
 */

// Re-implement the screening quick patterns (same regex as intent.ts)
function matchScreeningPatterns(input: string) {
  const lower = input.toLowerCase().trim();

  // P6-4: Screen candidate
  const screenMatch = /^(?:screen|screening)\s+(?:for\s+)?(.+?)(?:\s+for\s+(.+))?$/i.exec(lower);
  if (screenMatch) {
    const candidate = (screenMatch[1] ?? "").trim();
    const job = (screenMatch[2] ?? "").trim();
    return {
      action: "trigger_screening" as const,
      params: { candidate, ...(job ? { job } : {}) },
      confidence: 0.9,
      display: job ? `Screen ${candidate} for ${job}` : `Screen ${candidate}`,
    };
  }

  // P6-4: View screening results
  const viewScreeningMatch = /^(?:view|show|check)\s+screening\s+(?:for\s+|results?\s+(?:for\s+)?)?(.+)$/i.exec(lower);
  if (viewScreeningMatch) {
    const candidate = (viewScreeningMatch[1] ?? "").trim();
    return {
      action: "view_screening" as const,
      params: { candidate },
      confidence: 0.9,
      display: `View screening results for ${candidate}`,
    };
  }

  return null;
}

describe("P6-4: screening trigger_screening quick patterns", () => {
  it("should match 'screen Alice'", () => {
    const result = matchScreeningPatterns("screen Alice");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("trigger_screening");
    expect(result!.params.candidate).toBe("alice");
  });

  it("should match 'screening for Bob'", () => {
    const result = matchScreeningPatterns("screening for Bob");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("trigger_screening");
    expect(result!.params.candidate).toBe("bob");
  });

  it("should match 'screen Alice for Senior Engineer'", () => {
    const result = matchScreeningPatterns("screen Alice for Senior Engineer");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("trigger_screening");
    expect(result!.params.candidate).toBe("alice");
    expect((result!.params as Record<string, string>).job).toBe("senior engineer");
  });

  it("should match 'screening John Doe for Backend Developer'", () => {
    const result = matchScreeningPatterns("screening John Doe for Backend Developer");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("trigger_screening");
    expect(result!.params.candidate).toContain("john");
    expect((result!.params as Record<string, string>).job).toBe("backend developer");
  });
});

describe("P6-4: screening view_screening quick patterns", () => {
  it("should match 'view screening for Alice'", () => {
    const result = matchScreeningPatterns("view screening for Alice");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("view_screening");
    expect(result!.params.candidate).toBe("alice");
  });

  it("should match 'show screening results for Bob'", () => {
    const result = matchScreeningPatterns("show screening results for Bob");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("view_screening");
    expect(result!.params.candidate).toBe("bob");
  });

  it("should match 'check screening for Jane'", () => {
    const result = matchScreeningPatterns("check screening for Jane");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("view_screening");
    expect(result!.params.candidate).toBe("jane");
  });

  it("should match 'view screening result for Dave Smith'", () => {
    const result = matchScreeningPatterns("view screening result for Dave Smith");
    expect(result).not.toBeNull();
    expect(result!.action).toBe("view_screening");
    expect(result!.params.candidate).toContain("dave");
  });

  it("should not match unrelated patterns", () => {
    expect(matchScreeningPatterns("create a job")).toBeNull();
    expect(matchScreeningPatterns("find candidates")).toBeNull();
    expect(matchScreeningPatterns("check offer for Alice")).toBeNull();
  });
});
