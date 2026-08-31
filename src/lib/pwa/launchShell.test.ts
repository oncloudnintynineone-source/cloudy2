import { readFileSync } from "node:fs";

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
