/**
 * Vitest global setup.
 * Initializes MSW server for mocking external APIs.
 */
import { beforeAll, afterEach, afterAll } from "vitest";
import { server } from "../__mocks__/server";

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
