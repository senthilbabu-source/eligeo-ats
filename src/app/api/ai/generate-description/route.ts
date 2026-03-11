import { requireAuthAPI } from "@/lib/auth/api";
import { can } from "@/lib/constants/roles";
import { streamJobDescription } from "@/lib/ai/generate";
import { problemResponse } from "@/lib/utils/problem";

export async function POST(request: Request) {
  const { session, error } = await requireAuthAPI();
  if (error) return error;

  if (!can(session.orgRole, "jobs:create")) {
    return problemResponse(403, "ATS-AU04", "Insufficient permissions");
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "ATS-AI01", "Invalid request body");
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return problemResponse(400, "ATS-AI01", "Job title is required");
  }

  const result = await streamJobDescription({
    title,
    department: typeof body.department === "string" ? body.department : undefined,
    keyPoints: typeof body.keyPoints === "string" ? body.keyPoints : undefined,
    organizationId: session.orgId,
    userId: session.userId,
  });

  if (!result) {
    return problemResponse(402, "ATS-AI02", "Insufficient AI credits");
  }

  return result.toTextStreamResponse();
}
