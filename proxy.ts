import { type NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { CONFIG } from "@/lib/constants/config";

/**
 * Next.js 16 middleware (ADR-002: file is `proxy.ts`, not `middleware.ts`).
 * Rate limiting via Upstash Redis when env vars are configured.
 */

// Lazily initialize rate limiters only when Upstash is configured
let publicLimiter: Ratelimit | null = null;
let formLimiter: Ratelimit | null = null;
let aiLimiter: Ratelimit | null = null;

function getPublicLimiter(): Ratelimit | null {
  if (publicLimiter) return publicLimiter;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  publicLimiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(CONFIG.RATE_LIMIT.PUBLIC_MAX, CONFIG.RATE_LIMIT.PUBLIC_WINDOW),
    prefix: "rl:public",
  });
  return publicLimiter;
}

function getFormLimiter(): Ratelimit | null {
  if (formLimiter) return formLimiter;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  formLimiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(CONFIG.RATE_LIMIT.FORM_MAX, CONFIG.RATE_LIMIT.FORM_WINDOW),
    prefix: "rl:form",
  });
  return formLimiter;
}

function getAiLimiter(): Ratelimit | null {
  if (aiLimiter) return aiLimiter;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  aiLimiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(CONFIG.RATE_LIMIT.AI_MAX, CONFIG.RATE_LIMIT.AI_WINDOW),
    prefix: "rl:ai",
  });
  return aiLimiter;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit public career pages (unauthenticated)
  if (pathname.startsWith("/careers")) {
    const ip = getClientIp(request);

    // Stricter limit for form submissions (POST)
    if (request.method === "POST") {
      const limiter = getFormLimiter();
      if (limiter) {
        const { success, remaining } = await limiter.limit(ip);
        if (!success) {
          return NextResponse.json(
            { error: "Too many submissions. Please try again later." },
            { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": String(remaining) } },
          );
        }
      }
    }

    // General public rate limit
    const limiter = getPublicLimiter();
    if (limiter) {
      const { success, remaining } = await limiter.limit(ip);
      if (!success) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": String(remaining) } },
        );
      }
    }
  }

  // Rate limit AI API endpoints (per-IP, keyed by user cookie if available)
  if (pathname.startsWith("/api/ai/")) {
    const ip = getClientIp(request);
    const limiter = getAiLimiter();
    if (limiter) {
      const { success, remaining } = await limiter.limit(`ai:${ip}`);
      if (!success) {
        return NextResponse.json(
          { error: "AI rate limit exceeded. Please wait a moment." },
          { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": String(remaining) } },
        );
      }
    }
  }

  // Rate limit health endpoint
  if (pathname === "/api/health") {
    const ip = getClientIp(request);
    const limiter = getPublicLimiter();
    if (limiter) {
      const { success } = await limiter.limit(`health:${ip}`);
      if (!success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
    }
  }

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
