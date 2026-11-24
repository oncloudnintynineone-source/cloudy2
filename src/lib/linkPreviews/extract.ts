/**
 * URL extraction from the event's plain-text remarks
 * (docs/event-lifecycle.md §1.12). Pure and client-safe: the details modal
 * renders remarks through {@link splitRemarksUrls} (linkifying what it finds)
 * and asks the preview API only for the URLs {@link extractPreviewUrls}
 * returns.
 */

/** URLs previewed per event — the API route enforces the same cap. */
export const MAX_PREVIEW_URLS = 5;

/**
 * http(s) URLs and bare `www.` hosts. The class excludes characters that
 * cannot appear in a bare URL in prose (quotes, angle brackets, backticks);
 * trailing punctuation is trimmed per candidate so "see https://x.com/a."
 * links `https://x.com/a` and leaves the full stop as text.
 */
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

/** One remarks run: plain text, or a link with its absolute href. */
export type RemarksSegment =
  { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

/**
 * Trim trailing prose punctuation off a raw match: sentence punctuation, and
 * closing brackets that have no opening counterpart. Returns the longest
 * plausible URL prefix of the match.
 */
function trimUrl(raw: string): string {
  let candidate = raw;
  for (;;) {
    const trimmed = candidate.replace(/[.,;:!?'"]+$/, "");
    const next =
      trimmed.endsWith(")") && countChar(trimmed, "(") < countChar(trimmed, ")")
        ? trimmed.slice(0, -1)
        : trimmed.endsWith("]") && countChar(trimmed, "[") < countChar(trimmed, "]")
          ? trimmed.slice(0, -1)
          : trimmed;
    if (next === candidate) {
      return candidate;
    }
    candidate = next;
  }
}

/** Parse a trimmed candidate into an absolute http(s) URL, or null. */
function toUrl(candidate: string): string | null {
  if (!candidate) {
    return null;
  }
  try {
    const url = new URL(/^www\./i.test(candidate) ? `https://${candidate}` : candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Normalize a raw URL mention: trim trailing prose punctuation, prepend the
 * scheme to `www.` hosts, drop the fragment, and reject anything that is not
 * http(s). Returns null when the candidate is not a usable URL.
 */
export function normalizeCandidate(raw: string): string | null {
  return toUrl(trimUrl(raw));
}

/** Split remarks text into plain-text and link segments, in order. */
export function splitRemarksUrls(text: string): RemarksSegment[] {
  const segments: RemarksSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const kept = trimUrl(raw);
    const href = toUrl(kept);
    if (!href) {
      continue;
    }
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({ kind: "link", text: kept, href });
    cursor = start + kept.length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}

/**
 * The unique absolute URLs to preview, in order of first appearance, capped
 * at {@link MAX_PREVIEW_URLS}.
 */
export function extractPreviewUrls(text: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const segment of splitRemarksUrls(text)) {
    if (segment.kind === "link" && segment.href && !seen.has(segment.href)) {
      seen.add(segment.href);
      urls.push(segment.href);
      if (urls.length >= MAX_PREVIEW_URLS) {
        break;
      }
    }
  }
  return urls;
}

function countChar(value: string, char: string): number {
  let count = 0;
  for (const c of value) {
    if (c === char) {
      count += 1;
    }
  }
  return count;
}
