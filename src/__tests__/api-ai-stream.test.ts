import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// --- Mocks ---

vi.mock("@/lib/utils/csrf", () => ({
  checkCsrf: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  requireAuthAPI: vi.fn(),
}));

vi.mock("@/lib/constants/roles", () => ({
  can: vi.fn(),
}));

vi.mock("@/lib/ai/generate", () => ({
  streamJobDescription: vi.fn(),
}));

vi.mock("@/lib/utils/problem", () => ({
  problemResponse: vi.fn(
    (status: number, code: string, detail: string) =>
      NextResponse.json({ status, type: code, detail }, { status }),
  ),
}));

import { POST } from "@/app/api/ai/generate-description/route";
import { checkCsrf } from "@/lib/utils/csrf";
import { requireAuthAPI } from "@/lib/auth/api";
import { can } from "@/lib/constants/roles";
import { streamJobDescription } from "@/lib/ai/generate";

// --- Helpers ---

function mockRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost:3000/api/ai/generate-description", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const mockSession = {
  orgId: "org-123",
  userId: "user-456",
  orgRole: "owner" as const,
  plan: "pro",
  featureFlags: {},
};

// --- Tests ---

describe("POST /api/ai/generate-description", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Defaults: all checks pass
    vi.mocked(checkCsrf).mockReturnValue(null);
    vi.mocked(requireAuthAPI).mockResolvedValue({
      session: mockSession,
      error: null,
    });
    vi.mocked(can).mockReturnValue(true);
    vi.mocked(streamJobDescription).mockResolvedValue({
      toTextStreamResponse: () => new Response("streamed content", { status: 200 }),
    } as ReturnType<typeof streamJobDescription> extends Promise<infer T> ? T : never);
  });

  it("should return 403 when CSRF check fails", async () => {
    // Arrange
    const csrfResponse = NextResponse.json(
      { error: "Missing Origin header" },
      { status: 403 },
    );
    vi.mocked(checkCsrf).mockReturnValue(csrfResponse);
    const req = mockRequest({ title: "Engineer" });

    // Act
    const response = await POST(req);

    // Assert
    expect(response.status).toBe(403);
    expect(requireAuthAPI).not.toHaveBeenCalled();
  });

  it("should return 401 when not authenticated", async () => {
    // Arrange
    const authError = NextResponse.json(
      { status: 401, type: "ATS-AU01", detail: "Authentication required" },
      { status: 401 },
    );
    vi.mocked(requireAuthAPI).mockResolvedValue({
      session: null,
      error: authError,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const req = mockRequest({ title: "Engineer" });

    // Act
    const response = await POST(req);

    // Assert
    expect(response.status).toBe(401);
    expect(can).not.toHaveBeenCalled();
  });

  it("should return 403 when role lacks permission", async () => {
    // Arrange
    vi.mocked(can).mockReturnValue(false);
    const req = mockRequest({ title: "Engineer" });

    // Act
    const response = await POST(req);

    // Assert
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.type).toBe("ATS-AU04");
  });

  it("should return 400 for invalid JSON body", async () => {
    // Arrange — create a request with invalid JSON
    const req = new Request(
      "http://localhost:3000/api/ai/generate-description",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json{{{",
      },
    );

    // Act
    const response = await POST(req);

    // Assert
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.type).toBe("ATS-AI01");
  });

  it("should return 400 when title is missing", async () => {
    // Arrange
    const req = mockRequest({ department: "Engineering" });

    // Act
    const response = await POST(req);

    // Assert
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.type).toBe("ATS-AI01");
    expect(body.detail).toBe("Job title is required");
  });

  it("should return 402 when AI credits insufficient", async () => {
    // Arrange
    vi.mocked(streamJobDescription).mockResolvedValue(null);
    const req = mockRequest({ title: "Senior Engineer" });

    // Act
    const response = await POST(req);

    // Assert
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.type).toBe("ATS-AI02");
  });

  it("should stream response on success", async () => {
    // Arrange
    const streamResponse = new Response("streamed job description", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
    vi.mocked(streamJobDescription).mockResolvedValue({
      toTextStreamResponse: () => streamResponse,
    } as ReturnType<typeof streamJobDescription> extends Promise<infer T> ? T : never);
    const req = mockRequest({
      title: "Senior Engineer",
      department: "Engineering",
      keyPoints: "Remote, TypeScript",
    });

    // Act
    const response = await POST(req);

    // Assert
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe("streamed job description");
    expect(streamJobDescription).toHaveBeenCalledWith({
      title: "Senior Engineer",
      department: "Engineering",
      keyPoints: "Remote, TypeScript",
      organizationId: "org-123",
      userId: "user-456",
    });
  });
});
