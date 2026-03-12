import { describe, it, expect } from "vitest";
import { isEmbeddingStale, computeSkillGap } from "@/app/(app)/jobs/[id]/ai-match-panel";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-03-11T12:00:00Z").getTime();

describe("isEmbeddingStale", () => {
  it("returns false when embeddingUpdatedAt is null (no tracking yet)", () => {
    expect(isEmbeddingStale(null, NOW)).toBe(false);
  });

  it("returns false when updated less than 7 days ago", () => {
    const recent = new Date(NOW - 3 * DAY_MS).toISOString();
    expect(isEmbeddingStale(recent, NOW)).toBe(false);
  });

  it("returns false when updated exactly 7 days ago (boundary — not stale)", () => {
    const exactly7 = new Date(NOW - 7 * DAY_MS).toISOString();
    expect(isEmbeddingStale(exactly7, NOW)).toBe(false);
  });

  it("returns true when updated more than 7 days ago", () => {
    const old = new Date(NOW - 8 * DAY_MS).toISOString();
    expect(isEmbeddingStale(old, NOW)).toBe(true);
  });

  it("returns true when updated 30 days ago", () => {
    const veryOld = new Date(NOW - 30 * DAY_MS).toISOString();
    expect(isEmbeddingStale(veryOld, NOW)).toBe(true);
  });
});

describe("computeSkillGap", () => {
  it("returns all matched when candidate has all required skills", () => {
    const result = computeSkillGap(["React", "TypeScript"], ["React", "TypeScript", "Node.js"]);
    expect(result.matched).toEqual(["React", "TypeScript"]);
    expect(result.missing).toEqual([]);
  });

  it("returns all missing when candidate has none of the required skills", () => {
    const result = computeSkillGap(["Kubernetes", "Go"], ["React", "TypeScript"]);
    expect(result.matched).toEqual([]);
    expect(result.missing).toEqual(["Kubernetes", "Go"]);
  });

  it("performs case-insensitive matching", () => {
    const result = computeSkillGap(["React"], ["react"]);
    expect(result.matched).toEqual(["React"]);
    expect(result.missing).toEqual([]);
  });

  it("returns empty arrays when required skills is empty", () => {
    const result = computeSkillGap([], ["React", "TypeScript"]);
    expect(result.matched).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("returns mixed matched and missing", () => {
    const result = computeSkillGap(["React", "Kubernetes", "TypeScript"], ["react", "node.js"]);
    expect(result.matched).toEqual(["React"]);
    expect(result.missing).toEqual(["Kubernetes", "TypeScript"]);
  });
});
