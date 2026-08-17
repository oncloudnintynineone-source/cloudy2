/**
 * Pure formatter that renders a user's fully qualified name from an
 * admin-defined template. Kept free of I/O so it can be unit-tested without a
 * database.
 */

export const NAME_TEMPLATE_PLACEHOLDERS = ["name", "department"] as const;

export interface FullNameInput {
  name: string;
  departmentName: string | null;
}

/**
 * Substitute every `{...}` token in the template with the matching user field
 * (case-insensitive: `{NAME}`, `{Name}`, `{department}` all work). Values
 * resolve to an empty string when absent, unknown tokens are left as literal
 * text, and the final result is trimmed.
 */
export function formatFullName(input: FullNameInput, template: string): string {
  const values: Record<string, string> = {
    name: input.name,
    department: input.departmentName ?? "",
  };

  return template
    .replace(/\{([^}]+)\}/g, (match, token: string) => {
      const value = values[token.trim().toLowerCase()];
      return value === undefined ? match : value;
    })
    .trim();
}
