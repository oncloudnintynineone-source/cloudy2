/**
 * SSRF gate for link previews (docs/event-lifecycle.md §1.12).
 *
 * The preview fetcher runs server-side against user-supplied URLs, so every
 * URL — and every redirect hop, and every `og:image` — passes through
 * {@link isSafePreviewUrl} before a request is made. It rejects non-http(s)
 * schemes and hosts that resolve (literally) into private, loopback,
 * link-local or reserved space.
 *
 * Residual risk, accepted: a *domain* name can still point at a private
 * address (DNS misconfiguration or rebinding). The blast radius is a
 * server-side GET whose body is only ever parsed for `<meta>` tags — the
 * document itself is never rendered or stored — and images are re-validated
 * before the browser is asked to load them.
 */

/** Hostnames that never resolve publicly, whatever DNS says. */
const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".onion",
  ".localdomain",
];

export function isSafePreviewUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  return isSafeHost(url.hostname);
}

/** The host check, split out so tests cover it without URL plumbing. */
export function isSafeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host) {
    return false;
  }
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (bare === "localhost" || BLOCKED_SUFFIXES.some((suffix) => bare.endsWith(suffix))) {
    return false;
  }
  if (isIpv4Literal(bare)) {
    return isSafeIpv4(bare);
  }
  if (bare.includes(":")) {
    return isSafeIpv6(bare);
  }
  // A domain name: allowed — the address it resolves to is checked nowhere
  // else (see the residual-risk note above).
  return true;
}

function isIpv4Literal(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function isSafeIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.some((part) => part > 255)) {
    return false;
  }
  // Reject octet padding ("010.1.1.1" parses as octal in some resolvers).
  const octets = host.split(".");
  if (octets.some((octet) => octet.length > 1 && octet.startsWith("0"))) {
    return false;
  }
  const [a, b] = parts;
  return !(
    a === 0 || // "this" network + reserved
    a === 10 || // RFC 1918
    (a === 100 && b >= 64 && b <= 127) || // RFC 6598 CGNAT
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local (incl. the cloud metadata IP)
    (a === 172 && b >= 16 && b <= 31) || // RFC 1918
    (a === 192 && b === 0 && parts[2] === 0) || // IETF protocol assignments
    (a === 192 && b === 168) || // RFC 1918
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast + reserved
  );
}

function isSafeIpv6(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "::" || lower === "::1") {
    return false; // unspecified + loopback
  }
  // IPv4-mapped / compatible forms ("::ffff:10.0.0.1", "::10.0.0.1").
  const v4 = lower.match(/:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4 && !isSafeIpv4(v4[1])) {
    return false;
  }
  const first = lower.split(":")[0];
  if (!first) {
    // "::something" — only the v4-mapped forms above may reach here.
    return !lower.startsWith("::");
  }
  const group = parseInt(first.padStart(4, "0"), 16);
  if (Number.isNaN(group)) {
    return false;
  }
  // fe80::/10 link-local, fc00::/7 unique local.
  const isLinkLocal = group >= 0xfe80 && group <= 0xfebf;
  const isUniqueLocal = group >= 0xfc00 && group <= 0xfdff;
  return !isLinkLocal && !isUniqueLocal;
}
