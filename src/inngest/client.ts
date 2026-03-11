import { Inngest } from "inngest";

/**
 * Shared Inngest client instance.
 * All background functions import from here.
 */
export const inngest = new Inngest({ id: "eligeo" });
