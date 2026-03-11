/**
 * Unit tests: problemResponse() — RFC 9457 Problem Details
 */

import { describe, it, expect } from "vitest";
import { problemResponse } from "@/lib/utils/problem";

describe("problemResponse()", () => {
  it("returns correct status code", async () => {
    const res = problemResponse(401, "ATS-AU01", "Authentication required");
    expect(res.status).toBe(401);
  });

  it("sets Content-Type to application/problem+json", async () => {
    const res = problemResponse(403, "ATS-AU04", "Forbidden");
    expect(res.headers.get("Content-Type")).toBe("application/problem+json");
  });

  it("includes RFC 9457 required fields", async () => {
    const res = problemResponse(400, "ATS-VA01", "Validation failed");
    const body = await res.json();
    expect(body).toMatchObject({
      type: "https://eligeo.io/errors/ats-va01",
      title: "Validation failed",
      status: 400,
      code: "ATS-VA01",
    });
  });

  it("lowercases code in type URL", async () => {
    const res = problemResponse(500, "ATS-SY01", "Internal error");
    const body = await res.json();
    expect(body.type).toBe("https://eligeo.io/errors/ats-sy01");
  });

  it("includes detail when provided", async () => {
    const res = problemResponse(
      403,
      "ATS-AU04",
      "Forbidden",
      "You need admin role.",
    );
    const body = await res.json();
    expect(body.detail).toBe("You need admin role.");
  });

  it("omits detail when not provided", async () => {
    const res = problemResponse(401, "ATS-AU01", "Auth required");
    const body = await res.json();
    expect(body.detail).toBeUndefined();
  });

  it("works with 500 status", async () => {
    const res = problemResponse(500, "ATS-SY01", "Internal Server Error");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.status).toBe(500);
  });
});
