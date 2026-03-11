import { describe, it, expect } from "vitest";
import {
  buildCandidateEmbeddingText,
  buildJobEmbeddingText,
} from "@/lib/ai/embeddings";

describe("buildCandidateEmbeddingText", () => {
  it("returns null for empty candidate", () => {
    expect(buildCandidateEmbeddingText({})).toBeNull();
  });

  it("returns null when all fields are null/undefined", () => {
    expect(
      buildCandidateEmbeddingText({
        resume_text: null,
        skills: [],
        current_title: null,
        current_company: null,
      }),
    ).toBeNull();
  });

  it("includes resume_text when present", () => {
    const text = buildCandidateEmbeddingText({
      resume_text: "5 years experience in React",
    });
    expect(text).toContain("5 years experience in React");
  });

  it("includes skills when present", () => {
    const text = buildCandidateEmbeddingText({
      skills: ["TypeScript", "React", "Node.js"],
    });
    expect(text).toContain("Skills: TypeScript, React, Node.js");
  });

  it("includes current_title when present", () => {
    const text = buildCandidateEmbeddingText({
      current_title: "Senior Engineer",
    });
    expect(text).toContain("Current role: Senior Engineer");
  });

  it("includes current_company when present", () => {
    const text = buildCandidateEmbeddingText({
      current_company: "Acme Corp",
    });
    expect(text).toContain("Company: Acme Corp");
  });

  it("combines all fields with double newlines", () => {
    const text = buildCandidateEmbeddingText({
      resume_text: "Resume here",
      skills: ["React"],
      current_title: "Dev",
      current_company: "Acme",
    });
    expect(text).toBe(
      "Resume here\n\nSkills: React\n\nCurrent role: Dev\n\nCompany: Acme",
    );
  });

  it("skips empty skills array", () => {
    const text = buildCandidateEmbeddingText({
      resume_text: "Resume",
      skills: [],
    });
    expect(text).toBe("Resume");
    expect(text).not.toContain("Skills:");
  });
});

describe("buildJobEmbeddingText", () => {
  it("includes title always", () => {
    const text = buildJobEmbeddingText({ title: "Senior PM" });
    expect(text).toBe("Senior PM");
  });

  it("includes description when present", () => {
    const text = buildJobEmbeddingText({
      title: "PM",
      description: "Lead product strategy",
    });
    expect(text).toContain("PM");
    expect(text).toContain("Lead product strategy");
  });

  it("includes required_skills when present", () => {
    const text = buildJobEmbeddingText({
      title: "Developer",
      required_skills: ["Go", "Kubernetes"],
    });
    expect(text).toContain("Required skills: Go, Kubernetes");
  });

  it("combines all fields with double newlines", () => {
    const text = buildJobEmbeddingText({
      title: "PM",
      description: "Strategy role",
      required_skills: ["SQL"],
    });
    expect(text).toBe("PM\n\nStrategy role\n\nRequired skills: SQL");
  });

  it("skips empty skills array", () => {
    const text = buildJobEmbeddingText({
      title: "PM",
      required_skills: [],
    });
    expect(text).toBe("PM");
  });

  it("skips null description", () => {
    const text = buildJobEmbeddingText({
      title: "PM",
      description: null,
    });
    expect(text).toBe("PM");
  });
});
