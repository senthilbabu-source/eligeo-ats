import { type NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 middleware (ADR-002: file is `proxy.ts`, not `middleware.ts`).
 * Rate limiting via Upstash Redis added when env vars are configured.
 */
export default async function proxy(_request: NextRequest) {
  const response = NextResponse.next();

  // Security headers (belt-and-suspenders with next.config.ts headers)
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and images.
     */
    "/((?!_next/static|_next/image|favicon.ico|images/).*)",
  ],
};
