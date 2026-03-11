import { http, HttpResponse } from "msw";

/**
 * MSW request handlers for all external APIs.
 * Each handler returns a sensible default response.
 * Tests can override via server.use() for specific scenarios.
 */
export const handlers = [
  // ─── Stripe ───
  http.post("https://api.stripe.com/v1/checkout/sessions", () => {
    return HttpResponse.json({
      id: "cs_test_mock",
      url: "https://checkout.stripe.com/mock",
    });
  }),

  http.post("https://api.stripe.com/v1/billing_portal/sessions", () => {
    return HttpResponse.json({
      id: "bps_test_mock",
      url: "https://billing.stripe.com/mock",
    });
  }),

  // ─── Resend ───
  http.post("https://api.resend.com/emails", () => {
    return HttpResponse.json({ id: "email_mock_id" });
  }),

  // ─── Inngest (no-op in tests) ───
  http.post("https://inn.gs/e/*", () => {
    return HttpResponse.json({ status: "ok" });
  }),
];
