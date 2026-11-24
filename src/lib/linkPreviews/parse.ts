/**
 * OpenGraph/Twitter-card metadata extraction for link previews
 * (docs/event-lifecycle.md §1.12). Pure: it takes the head-ish HTML string
 * the fetcher read and returns the fields a preview card renders. Regex
 * based on purpose — a full HTML parser is not worth the dependency for
 * `<meta>` tags, and every rule here is unit-tested.
 */
import { isSafePreviewUrl } from "./safety";

export interface OpenGraphMeta {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const TITLE_LIMIT = 120;
const DESCRIPTION_LIMIT = 200;

/** One `<meta ...>` tag, with its key (property or name) and content. */
const META_TAG_RE = /<meta\b[^>]*>/gi;
const KEY_RE = /(?:property|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/i;
const CONTENT_RE = /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/i;

/**
 * Extract the preview fields from an HTML document. Precedence per field:
 * `og:*` → `twitter:*` → the plain fallback (`<title>`, meta description).
 * `image` is resolved against `baseUrl` and must pass the SSRF gate.
 */
export function parseOpenGraphMeta(html: string, baseUrl: string): OpenGraphMeta {
  const tags = new Map<string, string>();
  for (const match of html.matchAll(META_TAG_RE)) {
    const tag = match[0];
    const key = tag.match(KEY_RE);
    const content = tag.match(CONTENT_RE);
    const name = decode(key?.[1] ?? key?.[2] ?? key?.[3] ?? "").toLowerCase();
    const value = decode(content?.[1] ?? content?.[2] ?? content?.[3] ?? "").trim();
    if (name && value && !tags.has(name)) {
      tags.set(name, value);
    }
  }

  const meta: OpenGraphMeta = {};

  const title = tags.get("og:title") ?? tags.get("twitter:title") ?? documentTitle(html) ?? "";
  if (title) {
    meta.title = truncate(title, TITLE_LIMIT);
  }
  const description =
    tags.get("og:description") ?? tags.get("twitter:description") ?? tags.get("description") ?? "";
  if (description) {
    meta.description = truncate(description, DESCRIPTION_LIMIT);
  }
  const image = tags.get("og:image") ?? tags.get("twitter:image") ?? tags.get("twitter:image:src");
  if (image) {
    const absolute = resolveImage(image, baseUrl);
    if (absolute) {
      meta.image = absolute;
    }
  }
  const siteName = tags.get("og:site_name");
  if (siteName) {
    meta.siteName = truncate(siteName, TITLE_LIMIT);
  }
  return meta;
}

function documentTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const text = decode(match?.[1] ?? "")
    .replace(/<[^>]*>/g, "")
    .trim();
  return text || null;
}

/** Absolute + SSRF-safe image URL, or null (a bad image just hides itself). */
function resolveImage(raw: string, baseUrl: string): string | null {
  try {
    const url = new URL(decode(raw).trim(), baseUrl);
    if (!isSafePreviewUrl(url.toString())) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** The handful of entities that actually show up in `<meta content="…">`. */
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isNaN(code) ? whole : safeFromCodePoint(code);
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isNaN(code) ? whole : safeFromCodePoint(code);
    }
    return ENTITIES[lower] ?? whole;
  });
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;
}
