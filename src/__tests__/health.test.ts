/**
 * API integration test: GET /api/health
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  const originalEnv = process.env.VERCEL_GIT_COMMIT_SHA;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.VERCEL_GIT_COMMIT_SHA = originalEnv;
    } else {
      delete process.env.VERCEL_GIT_COMMIT_SHA;
    }
  });

  it("returns 200 status", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns correct response shape", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");
  });

  it("returns valid ISO timestamp", async () => {
    const res = await GET();
    const body = await res.json();
    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });

  it("returns 'local' when no git SHA env var", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    const res = await GET();
    const body = await res.json();
    expect(body.version).toBe("local");
  });

  it("returns truncated git SHA when env var is set", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abc1234567890def";
    const res = await GET();
    const body = await res.json();
    expect(body.version).toBe("abc1234");
  });
});
