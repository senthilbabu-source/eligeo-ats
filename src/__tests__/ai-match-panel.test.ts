import { describe, it, expect } from "vitest";
import { isEmbeddingStale } from "@/app/(app)/jobs/[id]/ai-match-panel";

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
