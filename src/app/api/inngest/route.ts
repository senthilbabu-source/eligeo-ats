import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";

/**
 * Inngest endpoint — serves all registered background functions.
 * Functions will be imported here as they are built.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
});
