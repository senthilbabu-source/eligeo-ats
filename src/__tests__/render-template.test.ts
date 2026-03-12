import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  escapeHtml,
  validateMergeFields,
} from "@/lib/notifications/render-template";

describe("escapeHtml", () => {
  it("should escape & < > characters", () => {
    expect(escapeHtml("Tom & Jerry <script>alert('xss')</script>")).toBe(
      "Tom &amp; Jerry &lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
    );
  });

  it("should escape quotes", () => {
    expect(escapeHtml('She said "hello"')).toBe(
      "She said &quot;hello&quot;",
    );
  });

  it("should pass through safe strings unchanged", () => {
    expect(escapeHtml("Alice Johnson")).toBe("Alice Johnson");
  });
});

describe("renderTemplate", () => {
  const variables = {
    candidate: { name: "Alice Johnson", email: "alice@example.com" },
    job: { title: "Senior Engineer", department: "Engineering" },
    organization: { name: "itecbrains" },
    recruiter: { name: "Roshelle", email: "roshelle@itecbrains.com" },
  };

  it("should replace simple tokens", () => {
    const result = renderTemplate(
      "Hi {{candidate.name}}, welcome to {{organization.name}}!",
      variables,
    );
    expect(result).toBe("Hi Alice Johnson, welcome to itecbrains!");
  });

  it("should handle nested paths", () => {
    const result = renderTemplate(
      "Role: {{job.title}} in {{job.department}}",
      variables,
    );
    expect(result).toBe("Role: Senior Engineer in Engineering");
  });

  it("should replace unknown variables with empty string", () => {
    const result = renderTemplate(
      "Offer: {{offer.title}} starts {{offer.start_date}}",
      variables,
    );
    expect(result).toBe("Offer:  starts ");
  });

  it("should handle tokens with whitespace", () => {
    const result = renderTemplate(
      "Hi {{ candidate.name }}!",
      variables,
    );
    expect(result).toBe("Hi Alice Johnson!");
  });

  it("should HTML-escape values by default", () => {
    const xssVars = {
      candidate: { name: '<script>alert("xss")</script>' },
    };
    const result = renderTemplate("Hi {{candidate.name}}", xssVars);
    expect(result).toBe(
      "Hi &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("should skip escaping when escapeValues is false", () => {
    const xssVars = {
      candidate: { name: '<b>Bold</b>' },
    };
    const result = renderTemplate("Hi {{candidate.name}}", xssVars, {
      escapeValues: false,
    });
    expect(result).toBe("Hi <b>Bold</b>");
  });

  it("should handle template with no tokens", () => {
    const result = renderTemplate("No tokens here.", variables);
    expect(result).toBe("No tokens here.");
  });

  it("should handle null/undefined nested values", () => {
    const sparseVars = {
      candidate: { name: "Alice" },
      job: { title: "Engineer" },
    };
    const result = renderTemplate(
      "{{candidate.name}} — {{job.department}}",
      sparseVars,
    );
    // job.department is undefined → empty string
    expect(result).toBe("Alice — ");
  });
});

describe("validateMergeFields", () => {
  it("should return empty array when all fields are allowed", () => {
    const template = "Hi {{candidate.name}}, apply for {{job.title}}";
    const result = validateMergeFields(template, [
      "candidate.name",
      "job.title",
    ]);
    expect(result).toEqual([]);
  });

  it("should return unknown fields", () => {
    const template =
      "{{candidate.name}} — {{secret.data}} — {{job.title}}";
    const result = validateMergeFields(template, [
      "candidate.name",
      "job.title",
    ]);
    expect(result).toEqual(["secret.data"]);
  });

  it("should handle template with no tokens", () => {
    const result = validateMergeFields("No tokens", ["candidate.name"]);
    expect(result).toEqual([]);
  });
});
