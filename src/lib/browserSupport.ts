/**
 * Pure helpers for detecting browsers below the app's supported engine floor.
 * Kept free of I/O so they can be unit tested without a database.
 *
 * The stack (Next.js 16 + React 19) compiles the client bundle for the
 * "baseline widely available" floor — Chrome 111, Edge 111, Firefox 111,
 * Safari 16.4. Below that floor the hydration bundle throws, so pages paint
 * but no client interactivity works at all (forms render but do nothing).
 * Detection therefore runs server-side against the `User-Agent` header — a
 * client-side check would itself need the very engine that is broken — and
 * **fails open**: anything that cannot be recognised as a known legacy
 * engine is treated as supported, so a parsing quirk can never show a false
 * "unsupported" banner. See docs/browser-support.md.
 */

/** Minimum major version for Chromium-based engines (Chrome, Edge, WebView…). */
export const MIN_CHROMIUM_MAJOR = 111;

/** Minimum version for WebKit (Safari / Apple WebViews). */
export const MIN_WEBKIT_VERSION = "16.4";

/** Minimum major version for Firefox. */
export const MIN_FIREFOX_MAJOR = 111;

/**
 * True when the User-Agent identifies an engine below the app's supported
 * floor. Fail-open: empty/missing input, unparseable versions, and unknown
 * engines all return false (treated as supported).
 */
export function detectLegacyBrowser(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim();
  if (!ua) {
    return false;
  }

  // 1) Chromium engines. The engine version is the signal, never the OS
  // version — Chrome on Android self-updates independently of the OS, so
  // e.g. an Android 7 device on Chrome 119 is fine while an Android 12
  // device frozen on Chrome 95 is not. `Chrome/` is the most reliable token
  // (it precedes `Edg/` in Edge UAs and is present in WebView/OPR/Samsung
  // Internet UAs); the others cover engines that only carry their own token.
  const chromium = ua.match(/(?:EdgiOS|Edg|CriOS|Chrome|Chromium)\/(\d+)/);
  if (chromium) {
    return isBelow(String(MIN_CHROMIUM_MAJOR), chromium[1]);
  }

  // 2) Firefox.
  const firefox = ua.match(/Firefox\/(\d+)/);
  if (firefox) {
    return isBelow(String(MIN_FIREFOX_MAJOR), firefox[1]);
  }

  // 3) Non-Chromium WebKit — Safari and Apple in-app WebViews. The WebKit
  // build string is frozen at `AppleWebKit/605.1.15` across all modern
  // iOS, so it carries no version signal; use the OS token (`CPU iPhone OS
  // 15_8` / `CPU OS 15_7_8` — it updates with the OS, as does Safari's
  // `Version/` token) and fall back to `Version/` where no OS token exists
  // (desktop Safari).
  if (/Safari\/|AppleWebKit\//.test(ua)) {
    const os = ua.match(/CPU (?:iPhone )?OS (\d+)(?:_(\d+))?/);
    if (os) {
      return isBelow(MIN_WEBKIT_VERSION, `${os[1]}.${os[2] ?? "0"}`);
    }
    const safariVersion = ua.match(/Version\/(\d+(?:\.\d+)?)/);
    if (safariVersion) {
      return isBelow(MIN_WEBKIT_VERSION, safariVersion[1]);
    }
  }

  // 4) Anything else — fail open.
  return false;
}

/** True when `version` is strictly below `target` (both `major[.minor]`). */
function isBelow(target: string, version: string): boolean {
  const t = parseVersion(target);
  const v = parseVersion(version);
  if (!t || !v) {
    return false; // unparseable → fail open
  }
  if (v.major !== t.major) {
    return v.major < t.major;
  }
  return v.minor < t.minor;
}

function parseVersion(raw: string): { major: number; minor: number } | null {
  const m = raw.match(/^(\d+)(?:\.(\d+))?/);
  if (!m) {
    return null;
  }
  return { major: Number(m[1]), minor: m[2] ? Number(m[2]) : 0 };
}
