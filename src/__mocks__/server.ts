import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * MSW server for intercepting HTTP requests in tests.
 * Handlers mock all external APIs (Stripe, Resend, etc.).
 */
export const server = setupServer(...handlers);
