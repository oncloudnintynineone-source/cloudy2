/**
 * Read-only widget credentials. Kept separate from the NextAuth session: the
 * widget clients (KWGT, Scriptable, Widgy) are native apps with no cookie jar,
 * so each device gets its own opaque bearer token.
 *
 * The plaintext token is returned exactly once at creation; only its SHA-256
 * hash is stored (`widget_tokens.token_hash`). The `c2w_` prefix plus a
 * base64url body makes a token self-identifying and impossible to confuse with
 * other secrets in a URL or a log.
 *
 * Server-only module (uses `node:crypto`).
 */

import { createHash, randomBytes } from "node:crypto";

export const WIDGET_TOKEN_PREFIX = "c2w_";
export const WIDGET_TOKEN_LABEL_MAX_LENGTH = 40;
export const WIDGET_TOKEN_LABEL_DEFAULT = "Widget";
/** Soft per-user cap — a sanity guard, not a product limit. */
export const MAX_WIDGET_TOKENS_PER_USER = 10;

/** `c2w_` + 32 random bytes base64url (43 chars). */
const TOKEN_PATTERN = /^c2w_[A-Za-z0-9_-]{43}$/;

/** A fresh plaintext token. The caller must show it once and never persist it. */
export function generateWidgetToken(): string {
  return `${WIDGET_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** SHA-256 hex of a token — the value stored and looked up. */
export function hashWidgetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The leading characters shown in the token list (enough to tell devices
 * apart, far too little to use). Never store the rest.
 */
export function widgetTokenPrefix(token: string): string {
  return token.slice(0, 12);
}

/**
 * Validate a token supplied by a client (header or query). Returns the
 * trimmed token or null. Rejecting malformed input before hashing keeps junk
 * out of the rate limiter and the DB lookup.
 */
export function parseWidgetToken(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const token = raw.trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

export type WidgetTokenLabelResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Trim, cap and default the user-entered device label. */
export function sanitizeWidgetTokenLabel(raw: unknown): WidgetTokenLabelResult {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.length > WIDGET_TOKEN_LABEL_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep the label under ${WIDGET_TOKEN_LABEL_MAX_LENGTH} characters`,
    };
  }
  // Control characters would make the audit row and the list unreadable.
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return { ok: false, error: "The label contains invalid characters" };
  }
  return { ok: true, value: value || WIDGET_TOKEN_LABEL_DEFAULT };
}
