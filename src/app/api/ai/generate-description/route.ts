import { requireAuthAPI } from "@/lib/auth/api";
import { assertCan } from "@/lib/constants/roles";
import { streamJobDescription } from "@/lib/ai/generate";
import { problemResponse } from "@/lib/utils/problem";

export async function POST(request: Request) {
  const { session, error } = await requireAuthAPI();
  if (error) return error;

  assertCan(session.orgRole, "jobs:create");

  const body = await request.json();
  const title = body.title as string | undefined;

  if (!title?.trim()) {
    return problemResponse(400, "ATS-AI01", "Job title is required");
  }

  const result = await streamJobDescription({
    title,
    department: body.department,
    keyPoints: body.keyPoints,
    organizationId: session.orgId,
    userId: session.userId,
  });

  if (!result) {
    return problemResponse(402, "ATS-AI02", "Insufficient AI credits");
  }

  return result.toTextStreamResponse();
}
