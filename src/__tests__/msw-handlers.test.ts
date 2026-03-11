/**
 * MSW handler registry test (D24 §4.1).
 * Verifies all 9 external services have mock handlers registered.
 */
import { describe, it, expect } from "vitest";
import { handlers } from "../__mocks__/handlers";

describe("MSW handler registry", () => {
  const handlerDescriptions = handlers.map((h) => {
    const info = h.info as { method: string; path: string };
    return `${info.method} ${info.path}`;
  });

  it("should have handlers for all 9 D24 services", () => {
    // 9 services: Stripe (2), Resend (1), Nylas (2), Typesense (2),
    // OpenAI (2), Merge.dev (1), Dropbox Sign (1), Inngest (1), Slack (1)
    expect(handlers.length).toBe(13);
  });

  it("should mock Stripe checkout and billing portal", () => {
    expect(handlerDescriptions).toContainEqual(
      expect.stringContaining("api.stripe.com"),
    );
  });

  it("should mock Resend email API", () => {
    expect(handlerDescriptions).toContainEqual(
      expect.stringContaining("api.resend.com"),
    );
  });

  it("should mock Nylas calendar API", () => {
    expect(handlerDescriptions).toContainEqual(
      expect.stringContaining("nylas.com"),
    );
  });

  it("should mock Typesense search API", () => {
    expect(handlerDescriptions).toContainEqual(
      expect.stringContaining("collections"),
    );
  });

  it("should mock OpenAI embeddings and chat completions", () => {
    expect(handlerDescriptions).toContainEqual(
      expect.stringContaining("api.openai.com"),
    );
  });

  it("should mock Merge.dev ATS API", () => {
    expect(handlerDescriptions).toContainEqual(
      expect.stringContaining("api.merge.dev"),
    );
  });

  it("should mock Dropbox Sign e-sign API", () => {
    expect(handlerDescriptions).toContainEqual(
      expect.stringContaining("hellosign.com"),
    );
  });

  it("should mock Inngest event ingestion", () => {
    expect(handlerDescriptions).toContainEqual(
      expect.stringContaining("inn.gs"),
    );
  });

  it("should mock Slack webhook alerts", () => {
    expect(handlerDescriptions).toContainEqual(
      expect.stringContaining("hooks.slack.com"),
    );
  });
});
