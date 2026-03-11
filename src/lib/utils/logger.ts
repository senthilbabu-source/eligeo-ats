import pino from "pino";

/**
 * Structured logger with PII redaction.
 * Uses pino-pretty in development, JSON in production.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(process.env.NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  }),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.email",
      "*.phone",
      "*.ssn",
    ],
    censor: "[REDACTED]",
  },
});

export default logger;
