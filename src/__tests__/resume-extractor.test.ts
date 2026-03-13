import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P6-1: Resume Extraction Pipeline Tests
 *
 * Tests for the hybrid PDF/DOCX text extraction and AI parsing pipeline.
 * D32 §4.1–§4.5 — extraction strategy, Zod validation, error handling.
 */

// ── Mock Dependencies ────────────────────────────────────

vi.mock("pdf-parse", () => {
  return {
    PDFParse: class MockPDFParse {
      private data: Buffer;
      constructor(options: { data: Buffer }) {
        this.data = options.data;
      }
      async getText() {
        const content = this.data.toString();
        if (content.includes("SCANNED")) {
          return { text: "", pages: [] };
        }
        return {
          text: "John Doe\nSoftware Engineer at Acme Inc\nPhone: 555-1234\nEmail: john@example.com\n\nSkills: TypeScript, React, Node.js, PostgreSQL, AWS, Docker, Kubernetes\n\nExperience:\nAcme Inc (2020-2024) — Senior Software Engineer\nBuilt scalable microservices and led team of 5 engineers.\n\nEducation:\nMIT — BS Computer Science 2019\nGPA 3.8, Dean's List",
          pages: [{ text: "page1", num: 1 }],
        };
      }
      async destroy() {}
    },
  };
});

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({
      value: "Jane Smith\nProduct Manager\nSkills: Agile, Product Strategy\nExperience: StartupCo (2019-2023)",
    }),
  },
}));

vi.mock("ai", () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      full_name: "John Doe",
      email: "john@example.com",
      phone: null,
      linkedin_url: null,
      summary: "Experienced software engineer",
      skills: ["TypeScript", "React", "Node.js"],
      experience: [{
        title: "Software Engineer",
        company: "Acme Inc",
        start_date: "2020-01",
        end_date: "2024-01",
      }],
      education: [{
        degree: "BS Computer Science",
        institution: "MIT",
        year: "2019",
      }],
    },
    usage: { inputTokens: 500, outputTokens: 200 },
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/ai/client", () => ({
  smartModel: "gpt-4o",
  AI_MODELS: { smart: "gpt-4o", fast: "gpt-4o-mini", embedding: "text-embedding-3-small" },
}));

vi.mock("@/lib/ai/credits", () => ({
  consumeAiCredits: vi.fn().mockResolvedValue(true),
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/constants/config", () => ({
  CONFIG: { AI: { RESUME_TEXT_MAX: 15000 } },
}));

import {
  extractTextFromPdf,
  extractTextFromDocx,
  determineExtractionStrategy,
  parseResumeText,
  extractAndParseResume,
  resumeExtractionSchema,
} from "@/lib/ai/resume-extractor";
import { consumeAiCredits } from "@/lib/ai/credits";

// ── extractTextFromPdf ───────────────────────────────────

describe("P6-1: extractTextFromPdf", () => {
  it("should extract text from a valid PDF buffer", async () => {
    const buffer = Buffer.from("Mock PDF content with text");
    const result = await extractTextFromPdf(buffer);

    expect(result.text).toContain("John Doe");
    expect(result.pageCount).toBe(1);
  });

  it("should return empty for scanned/image PDFs (short text)", async () => {
    const buffer = Buffer.from("SCANNED");
    const result = await extractTextFromPdf(buffer);

    expect(result.text).toBe("");
  });
});

// ── extractTextFromDocx ──────────────────────────────────

describe("P6-1: extractTextFromDocx", () => {
  it("should extract text from a valid DOCX buffer", async () => {
    const buffer = Buffer.from("Mock DOCX content");
    const result = await extractTextFromDocx(buffer);

    expect(result.text).toContain("Jane Smith");
    expect(result.text).toContain("Product Manager");
  });
});

// ── determineExtractionStrategy ──────────────────────────

describe("P6-1: determineExtractionStrategy", () => {
  it("should return 'text' for PDF with sufficient text", () => {
    expect(determineExtractionStrategy("application/pdf", 500)).toBe("text");
  });

  it("should return 'vision' for PDF with insufficient text", () => {
    expect(determineExtractionStrategy("application/pdf", 50)).toBe("vision");
  });

  it("should return 'text' for PDF at exactly the threshold", () => {
    expect(determineExtractionStrategy("application/pdf", 200)).toBe("text");
  });

  it("should return 'docx' for DOCX MIME type", () => {
    expect(
      determineExtractionStrategy(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        0,
      ),
    ).toBe("docx");
  });

  it("should return 'docx' for legacy Word MIME type", () => {
    expect(determineExtractionStrategy("application/msword", 0)).toBe("docx");
  });

  it("should return 'unsupported' for unknown MIME types", () => {
    expect(determineExtractionStrategy("image/png", 0)).toBe("unsupported");
    expect(determineExtractionStrategy("text/plain", 0)).toBe("unsupported");
  });
});

// ── parseResumeText ──────────────────────────────────────

describe("P6-1: parseResumeText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return parsed resume data from AI", async () => {
    const result = await parseResumeText({
      text: "John Doe\nSoftware Engineer\nSkills: TypeScript",
      organizationId: "org-1",
    });

    expect(result.data).toBeDefined();
    expect(result.data?.full_name).toBe("John Doe");
    expect(result.data?.skills).toContain("TypeScript");
    expect(result.error).toBeUndefined();
  });

  it("should return error when credits are insufficient", async () => {
    vi.mocked(consumeAiCredits).mockResolvedValueOnce(false);

    const result = await parseResumeText({
      text: "Resume content",
      organizationId: "org-1",
    });

    expect(result.data).toBeNull();
    expect(result.error).toBe("Insufficient AI credits");
  });
});

// ── extractAndParseResume (full pipeline) ────────────────

describe("P6-1: extractAndParseResume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should extract and parse a text-based PDF", async () => {
    const buffer = Buffer.from("Mock PDF with enough text content");
    const result = await extractAndParseResume({
      fileBuffer: buffer,
      mimeType: "application/pdf",
      organizationId: "org-1",
    });

    expect(result.strategy).toBe("text");
    expect(result.data?.full_name).toBe("John Doe");
    expect(result.data?.skills).toHaveLength(3);
    expect(result.error).toBeUndefined();
  });

  it("should extract and parse a DOCX file", async () => {
    const buffer = Buffer.from("Mock DOCX content");
    const result = await extractAndParseResume({
      fileBuffer: buffer,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      organizationId: "org-1",
    });

    expect(result.strategy).toBe("docx");
    expect(result.data).toBeDefined();
  });

  it("should return error for scanned PDFs (vision not yet available)", async () => {
    const buffer = Buffer.from("SCANNED");
    const result = await extractAndParseResume({
      fileBuffer: buffer,
      mimeType: "application/pdf",
      organizationId: "org-1",
    });

    expect(result.strategy).toBe("vision");
    expect(result.data).toBeNull();
    expect(result.error).toContain("vision extraction not yet available");
  });

  it("should return error for unsupported file types", async () => {
    const buffer = Buffer.from("Not a resume");
    const result = await extractAndParseResume({
      fileBuffer: buffer,
      mimeType: "image/png",
      organizationId: "org-1",
    });

    expect(result.strategy).toBe("unsupported");
    expect(result.data).toBeNull();
    expect(result.error).toContain("Unsupported MIME type");
  });
});

// ── Zod Schema Validation ────────────────────────────────

describe("P6-1: resumeExtractionSchema validation", () => {
  it("should validate a complete extraction result", () => {
    const valid = {
      full_name: "Test User",
      email: "test@example.com",
      skills: ["JavaScript"],
      experience: [{ title: "Dev", company: "Co" }],
      education: [{ degree: "BS", institution: "Uni" }],
    };

    const result = resumeExtractionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("should validate with minimal required fields", () => {
    const minimal = {
      skills: [],
      experience: [],
      education: [],
    };

    const result = resumeExtractionSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("should reject when skills array is missing", () => {
    const invalid = {
      experience: [],
      education: [],
    };

    const result = resumeExtractionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
