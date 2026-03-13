import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["carin-subfastigiate-baggily.ngrok-free.dev"],
  serverExternalPackages: ["pino"],
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            `connect-src 'self' ${[
              process.env.NEXT_PUBLIC_SUPABASE_URL,
              "https://*.sentry.io",
              "https://api.openai.com",
            ].filter(Boolean).join(" ")}`,
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join("; "),
        },
      ],
    },
  ],
};

export default nextConfig;
