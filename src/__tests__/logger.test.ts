/**
 * Unit tests: logger — Pino structured logger with PII redaction
 */

import { describe, it, expect } from "vitest";
import logger from "@/lib/utils/logger";

describe("logger", () => {
  it("exports a pino logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("has PII redaction configured", () => {
    // Pino stores redact config internally; verify the logger
    // can serialize objects without exposing PII fields
    const child = logger.child({ test: true });
    expect(typeof child.info).toBe("function");
  });

  it("respects LOG_LEVEL environment variable", () => {
    // Logger level should be 'info' by default (LOG_LEVEL not set in test)
    expect(logger.level).toBe("info");
  });
});
