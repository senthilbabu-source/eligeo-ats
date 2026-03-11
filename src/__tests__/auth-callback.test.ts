/**
 * API integration test: GET /api/auth/callback
 * Tests Supabase auth code exchange and redirect behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase server client before importing the route
const mockExchangeCode = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCode,
    },
  })),
}));

import { GET } from "@/app/api/auth/callback/route";

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost:3000/api/auth/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /dashboard on successful code exchange", async () => {
    mockExchangeCode.mockResolvedValue({ error: null });
    const res = await GET(makeRequest({ code: "valid-code" }));
    expect(res.status).toBe(307); // NextResponse.redirect
    expect(new URL(res.headers.get("Location")!).pathname).toBe("/dashboard");
  });

  it("uses next param for redirect destination", async () => {
    mockExchangeCode.mockResolvedValue({ error: null });
    const res = await GET(
      makeRequest({ code: "valid-code", next: "/jobs/123" }),
    );
    expect(new URL(res.headers.get("Location")!).pathname).toBe("/jobs/123");
  });

  it("redirects to /login?error=auth when code exchange fails", async () => {
    mockExchangeCode.mockResolvedValue({
      error: { message: "Invalid code" },
    });
    const res = await GET(makeRequest({ code: "bad-code" }));
    const location = new URL(res.headers.get("Location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth");
  });

  it("redirects to /login?error=auth when no code param", async () => {
    const res = await GET(makeRequest({}));
    const location = new URL(res.headers.get("Location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth");
  });

  it("calls exchangeCodeForSession with the code param", async () => {
    mockExchangeCode.mockResolvedValue({ error: null });
    await GET(makeRequest({ code: "my-auth-code" }));
    expect(mockExchangeCode).toHaveBeenCalledWith("my-auth-code");
  });

  it("does not call exchangeCodeForSession when code is missing", async () => {
    await GET(makeRequest({}));
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });
});
