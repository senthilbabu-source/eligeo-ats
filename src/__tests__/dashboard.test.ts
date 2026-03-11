import { describe, it, expect } from "vitest";
import { aggregateSources } from "@/lib/utils/dashboard";

describe("aggregateSources", () => {
  it("should use candidate_sources.name (canonical) when source_id is set", () => {
    const rows = [
      { candidates: { source: "linkedin", candidate_sources: { name: "LinkedIn" } } },
      { candidates: { source: "linked in", candidate_sources: { name: "LinkedIn" } } },
      { candidates: { source: "indeed", candidate_sources: { name: "Indeed" } } },
    ];

    const result = aggregateSources(rows);

    // Both "linkedin" and "linked in" raw values resolve to canonical "LinkedIn"
    expect(result[0]).toEqual(["LinkedIn", 2]);
    expect(result[1]).toEqual(["Indeed", 1]);
  });

  it("should fall back to source TEXT when candidate_sources is null (legacy records)", () => {
    const rows = [
      { candidates: { source: "Referral", candidate_sources: null } },
      { candidates: { source: "Referral", candidate_sources: null } },
      { candidates: { source: "Website", candidate_sources: null } },
    ];

    const result = aggregateSources(rows);

    expect(result[0]).toEqual(["Referral", 2]);
    expect(result[1]).toEqual(["Website", 1]);
  });

  it("should return 'Unknown' when both source and candidate_sources are null", () => {
    const rows = [
      { candidates: { source: null, candidate_sources: null } },
      { candidates: null },
    ];

    const result = aggregateSources(rows);

    expect(result).toEqual([["Unknown", 2]]);
  });
});
