/**
 * The one recipe for a link that leaves the app.
 *
 * Every external destination — remark links, link-preview cards, quick links,
 * Google Calendar hand-offs — opens in a new tab and never hands the opener a
 * `window` reference (`noopener`), so a third-party page can neither navigate
 * this app's tab nor reach it through `window.opener`. Spreading
 * {@link EXTERNAL_LINK_PROPS} is what keeps `target`/`rel` from drifting per
 * call site. In-app navigation stays on `next/link` and keeps the tab.
 */
export const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

/**
 * True only for `http:`/`https:`. Rendered hrefs are already allowlisted by the
 * URL extractor; this is the render-time re-check (defense in depth over the
 * server's preview payload), so a malformed or hostile value that reached the
 * client can never become an anchor or an image source.
 */
export function isHttpUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Bidi overrides and zero-width marks: invisible in the URL text, but able to
 * reorder what a reader sees (`https://evil.com\u202E…`), so they can spoof a
 * different address. Stripped from display text — and percent-encoded in the
 * href, where the extractor's prose-tail trim already removes them.
 */
const CONTROL_CHARS_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Link display text: scheme dropped, trailing slash dropped, control
 * characters stripped, ellipsised past `maxLength`.
 */
export function shortenUrl(href: string, maxLength = 48): string {
  const bare = href
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .replace(CONTROL_CHARS_RE, "");
  return bare.length > maxLength ? `${bare.slice(0, maxLength - 1)}…` : bare;
}
