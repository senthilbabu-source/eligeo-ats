import { http, HttpResponse } from "msw";

/**
 * MSW request handlers for all external APIs (D24 §4.1).
 * Each handler returns a sensible default response.
 * Tests can override via server.use() for specific scenarios.
 *
 * Services (9): Stripe, Resend, Nylas, Typesense, OpenAI, Merge.dev,
 *               Dropbox Sign, Inngest, Slack
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

  // ─── Resend (email) ───
  http.post("https://api.resend.com/emails", () => {
    return HttpResponse.json({ id: "email_mock_id" });
  }),

  // ─── Nylas (calendar) ───
  http.get(
    "https://api.us.nylas.com/v3/grants/:grantId/events",
    () => {
      return HttpResponse.json({ data: [] });
    },
  ),

  http.post(
    "https://api.us.nylas.com/v3/grants/:grantId/events",
    () => {
      return HttpResponse.json({
        data: { id: "nylas_event_mock", status: "confirmed" },
      });
    },
  ),

  // ─── Typesense (search) ───
  http.post(
    "https://*/collections/:collection/documents/search",
    () => {
      return HttpResponse.json({
        hits: [],
        found: 0,
        page: 1,
      });
    },
  ),

  http.post(
    "https://*/collections/:collection/documents",
    () => {
      return HttpResponse.json({ id: "ts_doc_mock" });
    },
  ),

  // ─── OpenAI ───
  http.post("https://api.openai.com/v1/embeddings", () => {
    return HttpResponse.json({
      data: [{ embedding: new Array(1536).fill(0.01), index: 0 }],
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 10, total_tokens: 10 },
    });
  }),

  http.post("https://api.openai.com/v1/chat/completions", () => {
    return HttpResponse.json({
      id: "chatcmpl_mock",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "{}" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  }),

  // ─── Merge.dev (ATS integration) ───
  http.get("https://api.merge.dev/api/ats/v1/candidates", () => {
    return HttpResponse.json({ results: [], next: null });
  }),

  // ─── Dropbox Sign (e-sign) ───
  http.post(
    "https://api.hellosign.com/v3/signature_request/send",
    () => {
      return HttpResponse.json({
        signature_request: {
          signature_request_id: "sign_test_mock",
          signing_url: "https://app.hellosign.com/sign/test",
        },
      });
    },
  ),

  http.post(
    "https://api.hellosign.com/v3/signature_request/send_with_template",
    () => {
      return HttpResponse.json({
        signature_request: {
          signature_request_id: "sign_template_mock",
          title: "Offer Letter",
          signing_url: "https://app.hellosign.com/sign/mock",
        },
      });
    },
  ),

  http.post(
    "https://api.hellosign.com/v3/signature_request/cancel/:id",
    () => {
      return new HttpResponse(null, { status: 200 });
    },
  ),

  // ─── Inngest (no-op in tests) ───
  http.post("https://inn.gs/e/*", () => {
    return HttpResponse.json({ ids: ["evt_mock"] });
  }),

  // ─── Slack (alerts) ───
  http.post("https://hooks.slack.com/services/*", () => {
    return HttpResponse.json({ ok: true });
  }),
];
