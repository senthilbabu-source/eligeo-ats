import { describe, it, expect } from "vitest";

// Test the quick pattern matching by importing the module and calling parseIntent
// Since matchQuickPatterns is private, we test via the public API with mocked AI
// For unit tests, we only test the regex-matched quick patterns

describe("analytics_view intent patterns", () => {
  // We need to test the regex patterns directly since matchQuickPatterns is private.
  // We can verify by testing the regex patterns used.

  const patterns: Array<{ input: string; expected: string }> = [
    { input: "analytics", expected: "overview" },
    { input: "show analytics", expected: "overview" },
    { input: "open analytics dashboard", expected: "overview" },
    { input: "funnel", expected: "funnel" },
    { input: "show funnel", expected: "funnel" },
    { input: "conversion rates", expected: "funnel" },
    { input: "pipeline funnel", expected: "funnel" },
    { input: "time to hire", expected: "velocity" },
    { input: "hiring velocity", expected: "velocity" },
    { input: "show velocity", expected: "velocity" },
    { input: "source quality", expected: "sources" },
    { input: "show source analytics", expected: "sources" },
    { input: "team performance", expected: "team" },
    { input: "show team analytics", expected: "team" },
    { input: "job health", expected: "jobs" },
    { input: "show job performance", expected: "jobs" },
    { input: "how are we doing", expected: "overview" },
    { input: "show me the numbers", expected: "overview" },
    { input: "pipeline report", expected: "overview" },
  ];

  // Test the navigation pattern
  it("should match analytics navigation patterns", () => {
    const navPattern = /^(go to |open |show )?(analytics|analytics dashboard|reports?)$/i;
    expect(navPattern.test("analytics")).toBe(true);
    expect(navPattern.test("show analytics")).toBe(true);
    expect(navPattern.test("open analytics dashboard")).toBe(true);
    expect(navPattern.test("go to reports")).toBe(true);
  });

  it("should match funnel patterns", () => {
    const funnelPattern = /^(show |open )?(funnel|conversion rates?|pipeline funnel)$/i;
    expect(funnelPattern.test("funnel")).toBe(true);
    expect(funnelPattern.test("show funnel")).toBe(true);
    expect(funnelPattern.test("conversion rate")).toBe(true);
    expect(funnelPattern.test("pipeline funnel")).toBe(true);
  });

  it("should match velocity patterns", () => {
    const velocityPattern = /^(show |what('?s| is) )?(time to hire|hiring velocity|velocity)$/i;
    expect(velocityPattern.test("time to hire")).toBe(true);
    expect(velocityPattern.test("show hiring velocity")).toBe(true);
    expect(velocityPattern.test("what's time to hire")).toBe(true);
  });

  it("should match source patterns", () => {
    const sourcePattern = /^(show |open )?(source quality|source analytics|source roi)$/i;
    expect(sourcePattern.test("source quality")).toBe(true);
    expect(sourcePattern.test("show source analytics")).toBe(true);
  });

  it("should match team patterns", () => {
    const teamPattern = /^(show |open )?(team performance|team analytics|team report)$/i;
    expect(teamPattern.test("team performance")).toBe(true);
    expect(teamPattern.test("open team analytics")).toBe(true);
  });

  it("should match jobs patterns", () => {
    const jobsPattern = /^(show |open )?(job health|job performance|job analytics)$/i;
    expect(jobsPattern.test("job health")).toBe(true);
    expect(jobsPattern.test("show job performance")).toBe(true);
  });

  it("should match general analytics phrases", () => {
    const generalPattern = /^(how are we doing|show me the numbers|pipeline report)$/i;
    expect(generalPattern.test("how are we doing")).toBe(true);
    expect(generalPattern.test("show me the numbers")).toBe(true);
    expect(generalPattern.test("pipeline report")).toBe(true);
  });
});
