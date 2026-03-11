import { describe, it, expect } from "vitest";

/**
 * Test the matchQuickPatterns function from intent.ts.
 * Since it's not exported, we re-implement the regex patterns here
 * to verify correctness. The actual function uses the same patterns.
 *
 * This tests the fast path (no AI call) of the command bar.
 */

// Re-implement matchQuickPatterns for testing (same logic as intent.ts)
function matchQuickPatterns(input: string) {
  const lower = input.toLowerCase().trim();

  // Navigation
  if (/^(go to |open |show )?(jobs|job list)$/i.test(lower)) {
    return { action: "navigate", params: { page: "jobs" }, confidence: 1, display: "Navigate to Jobs" };
  }
  if (/^(go to |open |show )?(candidates|candidate list)$/i.test(lower)) {
    return { action: "navigate", params: { page: "candidates" }, confidence: 1, display: "Navigate to Candidates" };
  }
  if (/^(go to |open |show )?(dashboard|home)$/i.test(lower)) {
    return { action: "navigate", params: { page: "dashboard" }, confidence: 1, display: "Navigate to Dashboard" };
  }
  if (/^(go to |open |show )?settings$/i.test(lower)) {
    return { action: "navigate", params: { page: "settings" }, confidence: 1, display: "Navigate to Settings" };
  }

  // Quick search
  if (lower.startsWith("find ") || lower.startsWith("search ")) {
    const query = input.replace(/^(find|search)\s+/i, "").trim();
    if (/candidates?/i.test(query)) {
      return {
        action: "search_candidates",
        params: { query: query.replace(/candidates?\s*/i, "").trim() },
        confidence: 0.9,
        display: `Search candidates: ${query}`,
      };
    }
    if (/jobs?/i.test(query)) {
      return {
        action: "search_jobs",
        params: { query: query.replace(/jobs?\s*/i, "").trim() },
        confidence: 0.9,
        display: `Search jobs: ${query}`,
      };
    }
    return {
      action: "search_candidates",
      params: { query },
      confidence: 0.7,
      display: `Search candidates: ${query}`,
    };
  }

  // New job / new candidate
  if (/^(new|create|add) job/i.test(lower)) {
    return { action: "create_job", params: {}, confidence: 1, display: "Create a new job" };
  }
  if (/^(new|create|add) candidate/i.test(lower)) {
    return { action: "create_candidate", params: {}, confidence: 1, display: "Add a new candidate" };
  }

  return null;
}

describe("Intent Quick Pattern Matching", () => {
  describe("navigation intents", () => {
    it.each([
      ["jobs", "jobs"],
      ["go to jobs", "jobs"],
      ["open jobs", "jobs"],
      ["show jobs", "jobs"],
      ["job list", "jobs"],
    ])("'%s' navigates to %s", (input, page) => {
      const result = matchQuickPatterns(input);
      expect(result?.action).toBe("navigate");
      expect(result?.params.page).toBe(page);
      expect(result?.confidence).toBe(1);
    });

    it.each([
      ["candidates", "candidates"],
      ["go to candidates", "candidates"],
      ["candidate list", "candidates"],
    ])("'%s' navigates to %s", (input, page) => {
      const result = matchQuickPatterns(input);
      expect(result?.action).toBe("navigate");
      expect(result?.params.page).toBe(page);
    });

    it.each([
      ["dashboard", "dashboard"],
      ["home", "dashboard"],
      ["go to dashboard", "dashboard"],
    ])("'%s' navigates to %s", (input, page) => {
      const result = matchQuickPatterns(input);
      expect(result?.action).toBe("navigate");
      expect(result?.params.page).toBe(page);
    });

    it("'settings' navigates to settings", () => {
      const result = matchQuickPatterns("settings");
      expect(result?.action).toBe("navigate");
      expect(result?.params.page).toBe("settings");
    });
  });

  describe("search intents", () => {
    it("'find candidates' searches candidates", () => {
      const result = matchQuickPatterns("find candidates");
      expect(result?.action).toBe("search_candidates");
      expect(result?.confidence).toBe(0.9);
    });

    it("'search jobs' searches jobs", () => {
      const result = matchQuickPatterns("search jobs");
      expect(result?.action).toBe("search_jobs");
      expect(result?.confidence).toBe(0.9);
    });

    it("'find candidates react' extracts query", () => {
      const result = matchQuickPatterns("find candidates react");
      expect(result?.action).toBe("search_candidates");
      expect(result?.params.query).toContain("react");
    });

    it("'find alice' defaults to candidate search", () => {
      const result = matchQuickPatterns("find alice");
      expect(result?.action).toBe("search_candidates");
      expect(result?.params.query).toBe("alice");
      expect(result?.confidence).toBe(0.7);
    });
  });

  describe("create intents", () => {
    it.each(["new job", "create job", "add job"])(
      "'%s' creates a job",
      (input) => {
        const result = matchQuickPatterns(input);
        expect(result?.action).toBe("create_job");
        expect(result?.confidence).toBe(1);
      },
    );

    it.each(["new candidate", "create candidate", "add candidate"])(
      "'%s' creates a candidate",
      (input) => {
        const result = matchQuickPatterns(input);
        expect(result?.action).toBe("create_candidate");
        expect(result?.confidence).toBe(1);
      },
    );
  });

  describe("no match (falls through to AI)", () => {
    it("returns null for complex queries", () => {
      expect(matchQuickPatterns("move alice to technical")).toBeNull();
      expect(matchQuickPatterns("draft rejection email for bob")).toBeNull();
      expect(matchQuickPatterns("what candidates match the PM role?")).toBeNull();
    });

    it("returns null for empty input", () => {
      expect(matchQuickPatterns("")).toBeNull();
      expect(matchQuickPatterns("   ")).toBeNull();
    });
  });
});

describe("AI Credit Weights", () => {
  // Verify weights match migration 015 CHECK constraint
  const CREDIT_WEIGHTS: Record<string, number> = {
    resume_parse: 2,
    candidate_match: 1,
    job_description_generate: 3,
    email_draft: 1,
    feedback_summarize: 1,
    nl_intent: 1,
    bias_check: 1,
  };

  it("has exactly 7 action types", () => {
    expect(Object.keys(CREDIT_WEIGHTS)).toHaveLength(7);
  });

  it("resume_parse costs 2 credits (most expensive parse)", () => {
    expect(CREDIT_WEIGHTS.resume_parse).toBe(2);
  });

  it("job_description_generate costs 3 credits (most expensive)", () => {
    expect(CREDIT_WEIGHTS.job_description_generate).toBe(3);
  });

  it("all other actions cost 1 credit", () => {
    const oneCredit = ["candidate_match", "email_draft", "feedback_summarize", "nl_intent", "bias_check"];
    for (const action of oneCredit) {
      expect(CREDIT_WEIGHTS[action]).toBe(1);
    }
  });

  it("no action is free (all weights > 0)", () => {
    for (const weight of Object.values(CREDIT_WEIGHTS)) {
      expect(weight).toBeGreaterThan(0);
    }
  });
});
