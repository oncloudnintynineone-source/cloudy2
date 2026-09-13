/**
 * Generic `{token}` substitution for notification email templates. Pure and
 * I/O-free so every feature (KAH breach mail, the daily parade-state email)
 * shares one substitution convention: tokens are case-insensitive and trimmed,
 * and unknown tokens stay literal text so a typo never silently blanks a line.
 */

export function renderTemplate(
  template: string,
  context: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{([^{}]+)\}/g, (match, rawToken: string) => {
    const token = rawToken.trim().toLowerCase();
    return token in context ? context[token] : match;
  });
}
