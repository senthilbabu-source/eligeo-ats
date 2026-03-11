import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkCsrf } from "@/lib/utils/csrf";

function mockRequest(headers: Record<string, string>): Request {
  return {
    headers: new Headers(headers),
  } as Request;
}

describe("checkCsrf", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_DOMAIN", "eligeo.io");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should pass when Origin matches allowed origin", () => {
    const req = mockRequest({ origin: "https://eligeo.io" });
    const result = checkCsrf(req);
    expect(result).toBeNull();
  });

  it("should pass when Origin matches app subdomain", () => {
    const req = mockRequest({ origin: "https://app.eligeo.io" });
    const result = checkCsrf(req);
    expect(result).toBeNull();
  });

  it("should return 403 when Origin does not match any allowed origin", () => {
    const req = mockRequest({ origin: "https://evil.com" });
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("should return 403 when both Origin and Referer are missing", () => {
    const req = mockRequest({});
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("should validate Referer when Origin is missing", () => {
    const req = mockRequest({ referer: "https://eligeo.io/jobs/123" });
    const result = checkCsrf(req);
    expect(result).toBeNull();
  });

  it("should return 403 when Referer origin does not match", () => {
    const req = mockRequest({ referer: "https://evil.com/page" });
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("should return 403 for invalid Referer URL", () => {
    const req = mockRequest({ referer: "not-a-valid-url" });
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("should allow localhost:3000 in development mode", () => {
    vi.stubEnv("NODE_ENV", "development");

    const req = mockRequest({ origin: "http://localhost:3000" });
    const result = checkCsrf(req);
    expect(result).toBeNull();
  });

  it("should allow 127.0.0.1:3000 in development mode", () => {
    vi.stubEnv("NODE_ENV", "development");

    const req = mockRequest({ origin: "http://127.0.0.1:3000" });
    const result = checkCsrf(req);
    expect(result).toBeNull();
  });

  it("should reject localhost in production mode", () => {
    const req = mockRequest({ origin: "http://localhost:3000" });
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("should allow Vercel preview URL when VERCEL_URL is set", () => {
    vi.stubEnv("VERCEL_URL", "my-app-abc123.vercel.app");

    const req = mockRequest({ origin: "https://my-app-abc123.vercel.app" });
    const result = checkCsrf(req);
    expect(result).toBeNull();
  });
});
