/**
 * SMTP email transport for deployments without Google Workspace domain-wide
 * delegation (e.g. a personal Gmail account with an app password). The
 * connection is configured with a single `SMTP_URL` env var, e.g.
 * `smtp://user%40gmail.com:apppassword@smtp.gmail.com:465` (URL-encode the
 * username's `@`). Parsing is pure and unit-tested; sending never throws.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  /** Implicit TLS (smtps:// or port 465); otherwise STARTTLS via nodemailer default. */
  secure: boolean;
  user: string;
  pass: string;
}

export type SmtpEnv = Record<string, string | undefined>;

/**
 * Parse `SMTP_URL` into a nodemailer-ready config, or null when unset or
 * malformed. Accepts `smtp:`/`smtps:` schemes; `smtps:` and port 465 imply
 * implicit TLS. The userinfo part must carry user and password.
 */
export function parseSmtpConfig(env: SmtpEnv = process.env): SmtpConfig | null {
  const raw = env.SMTP_URL?.trim();
  if (!raw) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "smtp:" && url.protocol !== "smtps:") {
    return null;
  }
  const host = url.hostname.trim();
  const user = decodeURIComponent(url.username);
  const pass = decodeURIComponent(url.password);
  if (!host || !user || !pass) {
    return null;
  }
  const port = url.port ? Number(url.port) : url.protocol === "smtps:" ? 465 : 587;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return null;
  }
  return {
    host,
    port,
    secure: url.protocol === "smtps:" || port === 465,
    user,
    pass,
  };
}
