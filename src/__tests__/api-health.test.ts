import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc1234567");
  });

  it("should return 200 with status ok", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
  });

  it("should include timestamp", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });

  it("should include version from commit SHA", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.version).toBe("abc1234");
  });

  it("should return 'local' version when no commit SHA", async () => {
    vi.unstubAllEnvs();
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    const response = await GET();
    const body = await response.json();
    expect(body.version).toBe("local");
  });
});
