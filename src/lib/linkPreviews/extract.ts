/**
 * URL extraction from the event's plain-text remarks
 * (docs/event-lifecycle.md §1.7.5). Pure and client-safe: the details modal
 * renders remarks through {@link splitRemarksUrls} (linkifying what it finds)
 * and asks the preview API only for the URLs {@link extractPreviewUrls}
 * returns.
 *
 * Security: only `http:`/`https:` can ever reach a rendered `href` — a
 * `javascript:`, `data:` or `file:` mention stays plain text — and the renderer
 * re-checks every href before it becomes an anchor (`isHttpUrl`).
 */

/** URLs previewed per event — the API route enforces the same cap. */
export const MAX_PREVIEW_URLS = 5;

/** One candidate longer than this is not a URL a human typed; the preview route caps too. */
export const MAX_URL_LENGTH = 2048;

/**
 * Top-level domains accepted for a **scheme-less** host (`example.com/x`).
 * A curated list rather than "any 2–4 letters": that is what keeps prose like
 * `e.g.`, `i.e.`, `etc.` and filenames like `report.pdf` from becoming links.
 */
const BARE_TLDS = [
  "com", "net", "org", "edu", "gov", "mil", "int", "io", "dev", "app",
  "ai", "co", "sg", "my", "id", "uk", "us", "au", "ca", "nz",
  "in", "jp", "cn", "hk", "tw", "kr", "ph", "th", "vn", "de",
  "fr", "nl", "eu", "info", "biz", "me", "tv", "xyz", "cloud", "site",
  "tech", "online", "live", "gle", "gl", "ly", "be",
].join("|");

/** One host label: alphanumeric, inner hyphens allowed. */
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
/** A scheme-less absolute host: `example.com`, `www.example.com`, `foo.sg`. */
const BARE_HOST = `(?:${LABEL}\\.)+(?:${BARE_TLDS})`;
/** Optional port, then a path/query/fragment — the rest of a scheme-less URL. */
const TAIL = "(?::\\d{1,5})?(?:[/?#][^\\s<>\"'`]*)?";

/**
 * One URL candidate. The character class excludes what cannot appear bare in
 * prose (whitespace, quotes, angle brackets, backticks); everything else is
 * settled by {@link resolveLink}: trailing punctuation explicitly, prose glued
 * to the tail by re-parsing. The scheme form comes first, so a bare-host scan
 * never starts inside an absolute URL.
 */
const URL_SOURCE = `(?:https?:\\/\\/[^\\s<>"'\`]+|${BARE_HOST}${TAIL})`;

/** A second URL glued onto the first with `,`/`;` (`a.com,b.com`). */
const GLUED_START_RE = new RegExp(`^(?:https?:\\/\\/|${BARE_HOST})`, "i");

/**
 * A preceding character that makes a match part of a bigger token: an email
 * (`name@example.com`), a path (`ftp://x.com`), or a non-http scheme's payload
 * (`blob:https://…`, `javascript:…https://…`). A URL glued straight after a
 * colon with no space stays text — the safe side of that trade.
 */
const TOKEN_CHAR_RE = /[A-Za-z0-9._%+@/:]/;

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

/**
 * Parse a trimmed candidate into an absolute http(s) URL. `encoded` reports
 * that the serializer had to percent-encode something the author did not write
 * — i.e. the tail is prose, not part of the URL (`https://x.com/a的东西`).
 */
function parseHttpUrl(candidate: string): { href: string; encoded: boolean } | null {
  if (!candidate || candidate.length > MAX_URL_LENGTH) {
    return null;
  }
  // A scheme other than http(s) is never a link, even though prefixing
  // `https://` would happily parlay `mailto:me@example.com` into a URL with
  // credentials in it. (A dotted prefix like `example.com:8080` is a host:port,
  // not a scheme — hence the dot-free scheme class.)
  const scheme = /^([a-z][a-z0-9+-]*):/i.exec(candidate);
  if (scheme && !/^https?$/i.test(scheme[1])) {
    return null;
  }
  const absolute = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  let url: URL;
  try {
    url = new URL(absolute);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  const href = url.toString();
  if (href.length > MAX_URL_LENGTH) {
    return null;
  }
  return { href, encoded: countChar(href, "%") > countChar(candidate, "%") };
}

/**
 * The longest prefix of `raw` that is a clean URL, or null. Prose glued to a
 * URL (CJK text, a typographic apostrophe, `。`, an RTL mark) is percent-encoded
 * by the URL parser, so it is dropped character by character until the href
 * round-trips without new escapes. IDN hosts survive (punycode adds no `%`).
 */
function resolveLink(raw: string): { href: string; text: string } | null {
  let candidate = raw;
  for (let pass = 0; pass < 32 && candidate; pass += 1) {
    const trimmed = trimUrl(candidate);
    if (!trimmed) {
      return null;
    }
    const parsed = parseHttpUrl(trimmed);
    if (!parsed) {
      return null;
    }
    if (parsed.encoded) {
      candidate = trimmed.slice(0, -1);
      continue;
    }
    return { href: parsed.href, text: trimmed };
  }
  return null;
}

/**
 * Normalize a raw URL mention: trim trailing prose punctuation, prepend the
 * scheme to a bare host, keep the fragment, and reject anything that is not
 * http(s). Returns null when the candidate is not a usable URL.
 */
export function normalizeCandidate(raw: string): string | null {
  return resolveLink(raw)?.href ?? null;
}

/** The preview key for a href: the page itself, without its `#fragment`. */
export function previewUrlFor(href: string): string {
  try {
    const url = new URL(href);
    url.hash = "";
    return url.toString();
  } catch {
    return href;
  }
}

/** Index of a `,`/`;` that has another URL glued right after it, or -1. */
function gluedCut(raw: string): number {
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char !== "," && char !== ";") {
      continue;
    }
    if (GLUED_START_RE.test(raw.slice(index + 1))) {
      return index;
    }
  }
  return -1;
}

/**
 * Split remarks text into plain-text and link segments, in order. Only the URL
 * prefix of a match becomes the link; whatever the author wrote after it stays
 * text, so a link can never point somewhere the author did not mean.
 */
export function splitRemarksUrls(text: string): RemarksSegment[] {
  const segments: RemarksSegment[] = [];
  const re = new RegExp(URL_SOURCE, "gi");
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const start = match.index;
    let raw = match[0];
    // A second URL glued on with a comma/semicolon gets its own link; resume
    // the scan at it rather than swallowing it into the first href.
    const cut = gluedCut(raw);
    if (cut > 0) {
      raw = raw.slice(0, cut);
      re.lastIndex = start + cut + 1;
    }
    // A match only counts as a whole token: an email (`name@example.com`),
    // a non-http scheme's payload (`blob:https://…`) or a path (`ftp://x.com`)
    // must not yield a link.
    const before = start > 0 ? text[start - 1] : "";
    if (before && TOKEN_CHAR_RE.test(before)) {
      re.lastIndex = start + 1;
      continue;
    }
    const link = resolveLink(raw);
    if (!link) {
      re.lastIndex = start + 1;
      continue;
    }
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({ kind: "link", text: link.text, href: link.href });
    cursor = start + link.text.length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}

/**
 * The unique previewable URLs, in order of first appearance, capped at
 * {@link MAX_PREVIEW_URLS}. Keys are fragment-free, so two anchors on the same
 * page cost one preview.
 */
export function extractPreviewUrls(text: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const segment of splitRemarksUrls(text)) {
    if (segment.kind !== "link") {
      continue;
    }
    const key = previewUrlFor(segment.href);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    urls.push(key);
    if (urls.length >= MAX_PREVIEW_URLS) {
      break;
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
