/**
 * Server-side link-preview fetcher (docs/event-lifecycle.md §1.12).
 *
 * One preview = one bounded HTTP walk: every hop (and the eventual
 * `og:image`) passes the SSRF gate before it is touched; the response must be
 * `text/html`, is read up to a hard byte cap, and is only ever parsed for
 * `<meta>` tags — the document itself is never rendered or stored. Results
 * (including failures, briefly) are cached per server instance: previews are
 * enrichment, so a stale-in-memory cache is fine and a cold Cloud Run
 * instance simply pays one fetch.
 */
import { isSafePreviewUrl } from "./safety";
import { parseOpenGraphMeta } from "./parse";
import type { LinkPreview } from "./types";

export type { LinkPreview } from "./types";

const FETCH_TIMEOUT_MS = 5_000;
/** Redirect hops followed before giving up (each one re-validated). */
const MAX_HOPS = 3;
/** HTML read cap — `<meta>` tags live in the head; anything past this is noise. */
const MAX_BODY_BYTES = 256 * 1024;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 200;

const cache = new Map<string, { at: number; preview: LinkPreview | null }>();

/**
 * Fetch the preview for `rawUrl`, or null for anything unsafe, unfetchable
 * or unparseable — callers render no card in every one of those cases.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  if (!isSafePreviewUrl(rawUrl)) {
    return null;
  }
  const cached = cache.get(rawUrl);
  if (cached) {
    const ttl = cached.preview ? CACHE_TTL_MS : NEGATIVE_TTL_MS;
    if (Date.now() - cached.at < ttl) {
      return cached.preview;
    }
    cache.delete(rawUrl);
  }
  let preview: LinkPreview | null = null;
  try {
    preview = await walk(rawUrl);
  } catch {
    preview = null;
  }
  remember(rawUrl, preview);
  return preview;
}

/** Follow manual redirects (re-gating every hop), then parse the HTML. */
async function walk(startUrl: string): Promise<LinkPreview | null> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Cloudy2-LinkPreview/1.0 (internal calendar tool)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_HOPS) {
        return null;
      }
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        return null;
      }
      if (!isSafePreviewUrl(next.toString())) {
        return null;
      }
      url = next.toString();
      continue;
    }
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      return null;
    }
    const html = await readCapped(response);
    const finalUrl = new URL(url);
    const meta = parseOpenGraphMeta(html, finalUrl.toString());
    return {
      url: finalUrl.toString(),
      host: finalUrl.hostname,
      ...(meta.title ? { title: meta.title } : {}),
      ...(meta.description ? { description: meta.description } : {}),
      ...(meta.image ? { image: meta.image } : {}),
      ...(meta.siteName ? { siteName: meta.siteName } : {}),
    };
  }
  return null;
}

/** Read the body up to {@link MAX_BODY_BYTES}, then cancel the stream. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks: string[] = [];
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    read += value.byteLength;
    chunks.push(decoder.decode(value, { stream: true }));
    if (read >= MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  chunks.push(decoder.decode());
  return chunks.join("");
}

function remember(url: string, preview: LinkPreview | null): void {
  if (cache.size >= CACHE_MAX) {
    // Map iterates in insertion order — drop the oldest entry.
    const oldest = cache.keys().next();
    if (!oldest.done) {
      cache.delete(oldest.value);
    }
  }
  cache.set(url, { at: Date.now(), preview });
}
