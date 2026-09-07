import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { BASE_PAGES, SETTINGS_SUBTABS, resolveLaunchTarget } from "@/lib/ui/uiState";

/**
 * The PWA launch shell is a static HTML file served straight from the service
 * worker precache on every launch (see docs/pwa-offline.md §1.5.1), so its
 * redirect logic has to be inline JS — it cannot import `resolveLaunchTarget`.
 * That duplication is the risk these tests exist to contain: they parse the
 * shell and hold it to the same route whitelist the server uses, plus the two
 * structural properties the fix depends on.
 */
const SHELL_HTML = readFileSync(new URL("../../../public/loading.html", import.meta.url), "utf8");

function shellRoutes(): string[] {
  const match = /<script type="application\/json" id="c2-launch-routes">([\s\S]*?)<\/script>/.exec(
    SHELL_HTML,
  );
  if (!match) throw new Error("launch shell is missing its #c2-launch-routes block");
  return JSON.parse(match[1]) as string[];
}

describe("PWA launch shell", () => {
  it("whitelists exactly the routes resolveLaunchTarget can return", () => {
    expect(new Set(shellRoutes())).toEqual(new Set([...BASE_PAGES, ...SETTINGS_SUBTABS]));
  });

  it("is the launch's only resolver: the SW route never redirects away from it", () => {
    // The launch route must answer `/` with this shell, unconditionally. A
    // redirect there replaces the guaranteed paint with a *second* navigation,
    // and on a cold launch the only thing on screen while that one waits on the
    // network is the Android splash — the exact bug this page exists to kill.
    // (The route cannot peek at the remembered page instead either: `Cookie` is
    // a forbidden request header, appended after service-worker interception,
    // so `request.headers` never carries it.)
    const sw = readFileSync(new URL("../../../src/app/sw.ts", import.meta.url), "utf8");
    const start = sw.indexOf("async function handleLaunchRequest");
    const end = sw.indexOf("function isLaunchRequest");
    expect(start).toBeGreaterThan(-1);
    const body = sw.slice(start, end);
    expect(body).toContain("matchPrecache(LAUNCH_SHELL_URL)");
    expect(body).not.toContain("Response.redirect");
    expect(body.toLowerCase()).not.toContain("cookie");
  });

  it("renders one plain loading block, not a view-shaped skeleton", () => {
    // Dashboard views are on-demand tabs whose renderer kind is only known
    // after the server resolves the active tab, so the launch shell can no
    // longer shape its skeleton to the remembered view. It paints one neutral
    // block matching dashboard/loading.tsx's plain box instead (which also
    // reads correctly when the launch redirects to parade/contacts/settings).
    expect(SHELL_HTML).toContain('id="c2-main"');
    expect(SHELL_HTML).toContain("plainbox");
    expect(SHELL_HTML).not.toContain("data-variant=");
    expect(SHELL_HTML).not.toContain("data-view=");
  });

  it("follows the app's manual color-scheme override", () => {
    // The app (defaultColorScheme="auto") persists a ThemeToggle choice under
    // this localStorage key; the shell's head script must apply it pre-paint
    // so the skeleton doesn't flash the wrong scheme.
    expect(SHELL_HTML).toContain('localStorage.getItem("mantine-color-scheme-value")');
    expect(SHELL_HTML).toContain('data-c2-scheme');
  });

  it("only lists routes that resolveLaunchTarget accepts unchanged", () => {
    for (const route of shellRoutes()) {
      expect(resolveLaunchTarget(route, "admin")).toBe(route);
    }
  });

  it("falls back to the same default as the server", () => {
    expect(SHELL_HTML).toContain('var DEFAULT_TARGET = "/dashboard"');
    expect(resolveLaunchTarget(undefined, "user")).toBe("/dashboard");
  });

  it("defers the redirect past a presented frame", () => {
    // The whole point of the shell is that it paints before navigating away —
    // redirecting pre-paint means the Android splash never lifts, which is the
    // exact bug this page fixes. Two nested rAFs guarantee a presented frame.
    const nested =
      /requestAnimationFrame\(\s*function\s*\(\)\s*\{\s*requestAnimationFrame\(/.test(SHELL_HTML);
    expect(nested).toBe(true);
    expect(SHELL_HTML).toContain("location.replace(target)");
  });

  it("does not fetch the start URL (that round trip is what we removed)", () => {
    expect(SHELL_HTML).not.toContain("fetch(");
  });
});

// --- Runtime smoke test -------------------------------------------------
//
// Static parsing can't catch a runtime throw in the shell's inline script.
// That happened once: `VIEW_VALUES` was declared inside the skeleton-builder
// IIFE, so the redirect IIFE threw `ReferenceError` on the first use and
// aborted `location.replace` — the launch landed on the skeleton and never
// left it. These tests execute the shell's actual script under a minimal DOM
// shim (via `node:vm`, no browser) and assert the navigation always fires.

interface ShellElement {
  className: string;
  style: Record<string, string>;
  textContent: string;
  appendChild(): void;
  setAttribute(name: string, value: string): void;
}

function shellMainScript(): string {
  const blocks = Array.from(
    SHELL_HTML.matchAll(/<script(?![^>]*\btype=)[^>]*>([\s\S]*?)<\/script>/g),
  );
  const main = blocks.find((b) => b[1].includes("location.replace"));
  if (!main) throw new Error("launch shell is missing its redirect script");
  return main[1];
}

/** Mirrors encodeUiState's codec for the `cloudy2.ui` cookie. */
function uiCookie(state: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(state))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `cloudy2.ui=${encodeURIComponent(b64)}`;
}

/** Run the shell's main script with a DOM shim, then pump the two deferred
 *  animation frames so `location.replace` either fires or the test fails. */
function runShellScript(cookie: string | null) {
  const replaced: string[] = [];
  const attrsById = new Map<string, Record<string, string>>();
  const element = (id?: string): ShellElement => {
    const attrs: Record<string, string> = {};
    if (id) attrsById.set(id, attrs);
    return {
      className: "",
      style: {},
      textContent: "",
      appendChild() {},
      setAttribute(name: string, value: string) {
        attrs[name] = value;
      },
    };
  };
  const rafQueue: Array<() => void> = [];
  runInNewContext(shellMainScript(), {
    document: {
      createElement: () => element(),
      getElementById: (id: string) =>
        id === "c2-launch-routes"
          ? { textContent: JSON.stringify(shellRoutes()) }
          : element(id),
      cookie: cookie ?? "",
      documentElement: { setAttribute() {} },
    },
    location: { replace: (url: string) => replaced.push(url) },
    requestAnimationFrame: (cb: () => void) => rafQueue.push(cb),
    atob,
    btoa,
    TextDecoder,
    Uint8Array,
  });
  rafQueue.splice(0).forEach((cb) => cb());
  rafQueue.splice(0).forEach((cb) => cb());
  return { replaced, attrsById };
}

describe("launch shell redirect executes", () => {
  it("always leaves the skeleton — redirects to /dashboard with no remembered page", () => {
    expect(runShellScript(null).replaced).toEqual(["/dashboard"]);
  });

  it("redirects to the remembered page", () => {
    expect(runShellScript(uiCookie({ lastPage: "/parade-state" })).replaced).toEqual([
      "/parade-state",
    ]);
  });
});
