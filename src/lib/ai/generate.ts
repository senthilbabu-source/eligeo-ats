import { getOpenAIClient, AI_MODELS } from "./client";
import { consumeAiCredits, logAiUsage } from "./credits";

/**
 * Generate a full job description from a title and key points.
 * Returns formatted markdown text.
 */
export async function generateJobDescription(params: {
  title: string;
  department?: string;
  keyPoints?: string;
  organizationId: string;
  userId?: string;
}): Promise<{ text: string | null; error?: string }> {
  const { title, department, keyPoints, organizationId, userId } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "job_description_generate");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "job_description_generate",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { text: null, error: "Insufficient AI credits" };
  }

  try {
    const openai = getOpenAIClient();

    const prompt = [
      `Write a professional job description for the role: ${title}`,
      department && `Department: ${department}`,
      keyPoints && `Key points to include:\n${keyPoints}`,
      "",
      "Format with sections: About the Role, Responsibilities, Requirements, Nice to Have, What We Offer.",
      "Use clear, inclusive language. Avoid jargon and gendered terms.",
      "Keep it concise — aim for 400-600 words.",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: AI_MODELS.chat,
      messages: [
        {
          role: "system",
          content:
            "You are a talent acquisition expert who writes compelling, inclusive job descriptions. Return plain text with section headers.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
    });

    const latencyMs = Date.now() - startTime;
    const text = response.choices[0]?.message?.content ?? null;

    await logAiUsage({
      organizationId,
      userId,
      action: "job_description_generate",
      entityType: "job_opening",
      model: AI_MODELS.chat,
      tokensInput: response.usage?.prompt_tokens,
      tokensOutput: response.usage?.completion_tokens,
      latencyMs,
      status: "success",
    });

    return { text };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "job_description_generate",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { text: null, error: message };
  }
}

/**
 * Generate an AI-drafted email (rejection, outreach, update).
 */
export async function generateEmailDraft(params: {
  type: "rejection" | "outreach" | "update" | "follow_up";
  candidateName: string;
  jobTitle: string;
  context?: string;
  tone?: "warm" | "professional" | "casual";
  organizationId: string;
  userId?: string;
}): Promise<{ subject: string | null; body: string | null; error?: string }> {
  const {
    type,
    candidateName,
    jobTitle,
    context,
    tone = "warm",
    organizationId,
    userId,
  } = params;
  const startTime = Date.now();

  const credited = await consumeAiCredits(organizationId, "email_draft");
  if (!credited) {
    await logAiUsage({
      organizationId,
      userId,
      action: "email_draft",
      status: "skipped",
      errorMessage: "Insufficient AI credits",
    });
    return { subject: null, body: null, error: "Insufficient AI credits" };
  }

  const typeInstructions: Record<string, string> = {
    rejection:
      "Write a kind, respectful rejection email. Acknowledge their effort. Encourage future applications if appropriate.",
    outreach:
      "Write a compelling sourcing outreach email. Personalize based on the candidate's background. Keep it short and actionable.",
    update:
      "Write a brief status update email. Be transparent about the process and timeline.",
    follow_up:
      "Write a gentle follow-up email. Reference the previous communication. Keep it brief.",
  };

  try {
    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
      model: AI_MODELS.chat,
      messages: [
        {
          role: "system",
          content: `You are a recruiter drafting emails. Tone: ${tone}. ${typeInstructions[type] ?? ""}
Return JSON with "subject" and "body" fields. Body should be plain text with line breaks, not HTML.`,
        },
        {
          role: "user",
          content: [
            `Candidate: ${candidateName}`,
            `Role: ${jobTitle}`,
            context && `Context: ${context}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content;
    const parsed = content ? JSON.parse(content) : {};

    await logAiUsage({
      organizationId,
      userId,
      action: "email_draft",
      model: AI_MODELS.chat,
      tokensInput: response.usage?.prompt_tokens,
      tokensOutput: response.usage?.completion_tokens,
      latencyMs,
      status: "success",
      metadata: { type, tone },
    });

    return {
      subject: parsed.subject ?? null,
      body: parsed.body ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAiUsage({
      organizationId,
      userId,
      action: "email_draft",
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: message,
    });
    return { subject: null, body: null, error: message };
  }
}
