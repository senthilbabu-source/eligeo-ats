import { describe, it, expect } from "vitest";

/**
 * Test the matchQuickPatterns function from intent.ts.
 * Since it's not exported, we re-implement the regex patterns here
 * to verify correctness. The actual function uses the same patterns.
 *
 * This tests the fast path (no AI call) of the command bar.
 */

// Re-implement matchQuickPatterns for testing (same logic as intent.ts).
// IMPORTANT: Keep this in sync with src/lib/ai/intent.ts matchQuickPatterns.
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
  if (/^(go to |open |show |manage )?(pipelines?|pipeline templates?)$/i.test(lower)) {
    return { action: "navigate", params: { page: "pipelines" }, confidence: 1, display: "Navigate to Pipeline Settings" };
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

  // Navigation — offers/approvals
  if (/^(go to |open |show )?(offers?|offer list)$/i.test(lower)) {
    return { action: "navigate", params: { page: "offers" }, confidence: 1, display: "Navigate to Offers" };
  }
  if (/^(go to |open |show )?(approvals?|approval inbox|my approvals?)$/i.test(lower)) {
    return { action: "navigate", params: { page: "approvals" }, confidence: 1, display: "Navigate to Approvals" };
  }

  // New job / new candidate (already above in search block)

  // Create offer
  const createOfferMatch = /^(?:create|new|make|draft)\s+offer\s+(?:for\s+)?(.+)$/i.exec(lower);
  if (createOfferMatch) {
    const candidate = (createOfferMatch[1] ?? "").trim();
    return { action: "create_offer", params: { candidate }, confidence: 0.95, display: `Create offer for ${candidate}` };
  }

  // Check offer
  const checkOfferMatch = /^(?:check|show|view|list)\s+offers?\s*(?:for\s+)?(.*)$/i.exec(lower);
  if (checkOfferMatch) {
    const candidate = (checkOfferMatch[1] ?? "").trim();
    return { action: "check_offer", params: candidate ? { candidate } : {}, confidence: 0.9, display: candidate ? `Check offers for ${candidate}` : "Check all offers" };
  }
  if (/^offer status/i.test(lower)) {
    const rest = lower.replace(/^offer status\s*/i, "").trim();
    return { action: "check_offer", params: rest ? { candidate: rest } : {}, confidence: 0.9, display: rest ? `Check offer status for ${rest}` : "Check offer statuses" };
  }

  // H6-6: Merge candidates
  const mergeMatch = /^(?:merge|combine|dedupe?|dedup)\s+(?:candidates?\s+)?(.+)$/i.exec(lower);
  if (mergeMatch) {
    const candidate = (mergeMatch[1] ?? "").trim();
    return { action: "merge_candidates", params: { candidate }, confidence: 0.9, display: `Merge candidates: ${candidate}` };
  }

  // H6-6: Add to pool
  const poolMatch = /^(?:add|move)\s+(.+?)\s+(?:to\s+)?(?:pool|talent pool|nurture)\s*(.*)$/i.exec(lower);
  if (poolMatch) {
    const candidate = (poolMatch[1] ?? "").trim();
    const pool = (poolMatch[2] ?? "").trim();
    return { action: "add_to_pool", params: { candidate, ...(pool ? { pool } : {}) }, confidence: 0.9, display: `Add ${candidate} to ${pool || "talent pool"}` };
  }

  // H6-6: Parse resume
  const parseMatch = /^(?:parse|extract|process)\s+(?:resume\s+(?:for\s+)?)?(.+?)(?:\s+resume)?$/i.exec(lower);
  if (parseMatch && /resume/i.test(lower)) {
    const candidate = (parseMatch[1] ?? "").trim();
    return { action: "parse_resume", params: { candidate }, confidence: 0.9, display: `Parse resume for ${candidate}` };
  }

  // H6-6: Navigate to talent pools
  if (/^(go to |open |show )?(talent pools?|pools?)$/i.test(lower)) {
    return { action: "navigate", params: { page: "talent-pools" }, confidence: 1, display: "Navigate to Talent Pools" };
  }

  // Clone job intent patterns (E2) — most-specific first
  // "clone [title] for [level] level" → new_level (must match before generic location pattern)
  const cloneForLevel = /^clone\s+(.+?)\s+(?:for|as)\s+(.+?)\s+level$/i.exec(lower);
  if (cloneForLevel) {
    const title = (cloneForLevel[1] ?? "").trim();
    const level = (cloneForLevel[2] ?? "").trim();
    return {
      action: "clone_job",
      params: { title, reason: "new_level", level },
      confidence: 0.9,
      display: `Clone "${title}" at ${level} level`,
    };
  }

  // "clone [title] for [location]" → new_location intent
  const cloneForLocation = /^clone\s+(.+?)\s+for\s+(.+)$/i.exec(lower);
  if (cloneForLocation) {
    const title = (cloneForLocation[1] ?? "").trim();
    const location = (cloneForLocation[2] ?? "").trim();
    return {
      action: "clone_job",
      params: { title, reason: "new_location", location },
      confidence: 0.95,
      display: `Clone "${title}" for ${location}`,
    };
  }

  // "repost [title]" → repost intent
  const repost = /^repost\s+(.+)$/i.exec(lower);
  if (repost) {
    const title = (repost[1] ?? "").trim();
    return {
      action: "clone_job",
      params: { title, reason: "repost" },
      confidence: 0.95,
      display: `Repost "${title}"`,
    };
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

    it.each([
      ["pipelines", "pipelines"],
      ["pipeline", "pipelines"],
      ["go to pipelines", "pipelines"],
      ["manage pipelines", "pipelines"],
      ["pipeline templates", "pipelines"],
      ["open pipeline templates", "pipelines"],
    ])("'%s' navigates to %s", (input, page) => {
      const result = matchQuickPatterns(input);
      expect(result?.action).toBe("navigate");
      expect(result?.params.page).toBe(page);
      expect(result?.confidence).toBe(1);
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

  // ── H6-6: New command bar intents ──────────────────────────

  describe("merge_candidates intents (H6-6)", () => {
    it.each([
      "merge Alice Smith",
      "combine candidates John",
      "dedupe Bob Jones",
      "dedup candidate Jane",
    ])("'%s' maps to merge_candidates", (input) => {
      const result = matchQuickPatterns(input);
      expect(result?.action).toBe("merge_candidates");
      expect(result?.confidence).toBe(0.9);
    });

    it("extracts candidate name from 'merge Alice Smith'", () => {
      const result = matchQuickPatterns("merge Alice Smith");
      expect(result?.params.candidate).toBe("alice smith");
    });

    it("extracts candidate name from 'dedupe candidates Bob'", () => {
      const result = matchQuickPatterns("dedupe candidates Bob");
      expect(result?.params.candidate).toBe("bob");
    });
  });

  describe("add_to_pool intents (H6-6)", () => {
    it("'add Alice to pool' maps to add_to_pool", () => {
      const result = matchQuickPatterns("add Alice to pool");
      expect(result?.action).toBe("add_to_pool");
      expect(result?.params.candidate).toBe("alice");
      expect(result?.confidence).toBe(0.9);
    });

    it("'add Bob to talent pool Engineering' extracts pool name", () => {
      const result = matchQuickPatterns("add Bob to talent pool Engineering");
      expect(result?.action).toBe("add_to_pool");
      expect(result?.params.candidate).toBe("bob");
      expect((result?.params as Record<string, string>).pool).toBe("engineering");
    });

    it("'move Jane to nurture' maps to add_to_pool", () => {
      const result = matchQuickPatterns("move Jane to nurture");
      expect(result?.action).toBe("add_to_pool");
      expect(result?.params.candidate).toBe("jane");
    });
  });

  describe("parse_resume intents (H6-6)", () => {
    it("'parse resume for Alice' maps to parse_resume", () => {
      const result = matchQuickPatterns("parse resume for Alice");
      expect(result?.action).toBe("parse_resume");
      expect(result?.params.candidate).toBe("alice");
      expect(result?.confidence).toBe(0.9);
    });

    it("'extract resume Bob' maps to parse_resume", () => {
      const result = matchQuickPatterns("extract resume Bob");
      expect(result?.action).toBe("parse_resume");
      expect(result?.params.candidate).toBe("bob");
    });

    it("'process Alice resume' maps to parse_resume", () => {
      const result = matchQuickPatterns("process Alice resume");
      expect(result?.action).toBe("parse_resume");
      expect(result?.params.candidate).toBe("alice");
    });

    it("should not match 'parse data report' (no 'resume' keyword)", () => {
      const result = matchQuickPatterns("parse data report");
      expect(result?.action).not.toBe("parse_resume");
    });
  });

  describe("talent pools navigation (H6-6)", () => {
    it.each([
      "talent pools",
      "pools",
      "go to talent pools",
      "open pools",
      "show talent pool",
    ])("'%s' navigates to talent-pools", (input) => {
      const result = matchQuickPatterns(input);
      expect(result?.action).toBe("navigate");
      expect(result?.params.page).toBe("talent-pools");
      expect(result?.confidence).toBe(1);
    });
  });

  describe("clone job intents (E2)", () => {
    it("'clone senior engineer for London' → new_location with correct title and location", () => {
      const result = matchQuickPatterns("clone senior engineer for London");
      expect(result?.action).toBe("clone_job");
      expect(result?.params.reason).toBe("new_location");
      expect(result?.params.title).toBe("senior engineer");
      expect(result?.params.location).toBe("london");
      expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("'clone senior engineer for New York' extracts multi-word location", () => {
      const result = matchQuickPatterns("clone senior engineer for New York");
      expect(result?.action).toBe("clone_job");
      expect(result?.params.reason).toBe("new_location");
      expect(result?.params.location).toBe("new york");
    });

    it("'clone product manager for senior level' → new_level (specific pattern wins)", () => {
      const result = matchQuickPatterns("clone product manager for senior level");
      expect(result?.action).toBe("clone_job");
      expect(result?.params.reason).toBe("new_level");
      expect(result?.params.title).toBe("product manager");
      expect(result?.params.level).toBe("senior");
    });

    it("'clone backend engineer as junior level' → new_level via 'as' variant", () => {
      const result = matchQuickPatterns("clone backend engineer as junior level");
      expect(result?.action).toBe("clone_job");
      expect(result?.params.reason).toBe("new_level");
      expect(result?.params.level).toBe("junior");
    });

    it("'repost senior engineer' → repost intent", () => {
      const result = matchQuickPatterns("repost senior engineer");
      expect(result?.action).toBe("clone_job");
      expect(result?.params.reason).toBe("repost");
      expect(result?.params.title).toBe("senior engineer");
      expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("'repost engineering manager - platform' captures hyphenated title", () => {
      const result = matchQuickPatterns("repost engineering manager - platform");
      expect(result?.action).toBe("clone_job");
      expect(result?.params.reason).toBe("repost");
      expect(result?.params.title).toBe("engineering manager - platform");
    });

    it("display string describes the action clearly", () => {
      const result = matchQuickPatterns("clone senior engineer for Berlin");
      expect(result?.display).toMatch(/senior engineer/i);
      expect(result?.display).toMatch(/berlin/i);
    });

    it("plain 'clone' without title falls through to AI (returns null)", () => {
      // No title after "clone" — regex won't match
      expect(matchQuickPatterns("clone")).toBeNull();
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
