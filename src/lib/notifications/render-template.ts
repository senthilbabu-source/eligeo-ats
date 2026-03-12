/**
 * Email template token renderer — D08 §3.3
 *
 * Replaces {{variable.path}} tokens with values from a TemplateVariables object.
 * HTML-escapes values to prevent XSS in email bodies.
 * Unknown variables render as empty string (never raw template syntax).
 */

/**
 * Escape HTML special characters to prevent XSS in rendered email content.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Resolve a dot-notation path against a nested object.
 * Returns undefined if any segment is missing.
 */
function resolvePath(
  obj: Record<string, unknown>,
  path: string,
): string | undefined {
  const segments = path.split(".");
  let current: unknown = obj;

  for (const segment of segments) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  if (current == null) return undefined;
  return String(current);
}

/**
 * Render an email template by replacing {{variable.path}} tokens.
 *
 * @param template - The template string with {{token}} placeholders
 * @param variables - The TemplateVariables object to resolve tokens against
 * @param options - Optional config
 * @param options.escapeValues - Whether to HTML-escape resolved values (default: true)
 * @returns The rendered string with all tokens replaced
 */
export function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
  options: { escapeValues?: boolean } = {},
): string {
  const { escapeValues = true } = options;

  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const trimmedPath = path.trim();
    const value = resolvePath(variables, trimmedPath);

    if (value === undefined) return "";

    return escapeValues ? escapeHtml(value) : value;
  });
}

/**
 * Validate that a template only uses allowed merge fields.
 * Returns an array of unknown field paths found in the template.
 */
export function validateMergeFields(
  template: string,
  allowedFields: string[],
): string[] {
  const tokenRegex = /\{\{([^}]+)\}\}/g;
  const unknown: string[] = [];
  let match;

  while ((match = tokenRegex.exec(template)) !== null) {
    const field = match[1]!.trim();
    if (!allowedFields.includes(field)) {
      unknown.push(field);
    }
  }

  return unknown;
}
