import { NextResponse } from "next/server";

/**
 * Validate CSRF by checking Origin/Referer header against allowed origins.
 * Returns null if valid, or a 403 NextResponse if the check fails.
 *
 * Should be called at the top of mutating API route handlers (POST/PUT/PATCH/DELETE).
 * Server Actions are protected by Next.js built-in origin checks.
 */
export function checkCsrf(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // At least one header must be present for mutating requests
  if (!origin && !referer) {
    return NextResponse.json(
      { error: "Missing Origin header" },
      { status: 403 },
    );
  }

  const allowed = getAllowedOrigins();

  // Check Origin header (preferred)
  if (origin && !allowed.has(origin)) {
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403 },
    );
  }

  // If no Origin, validate Referer
  if (!origin && referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowed.has(refererOrigin)) {
        return NextResponse.json(
          { error: "Invalid referer" },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid referer" },
        { status: 403 },
      );
    }
  }

  return null; // CSRF check passed
}

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  // Always allow the app's own origin
  if (process.env.NEXT_PUBLIC_APP_DOMAIN) {
    origins.add(`https://${process.env.NEXT_PUBLIC_APP_DOMAIN}`);
    origins.add(`https://app.${process.env.NEXT_PUBLIC_APP_DOMAIN}`);
  }

  // Local development
  if (process.env.NODE_ENV === "development") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  // Vercel preview deployments
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }

  return origins;
}
