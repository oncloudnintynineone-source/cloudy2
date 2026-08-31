import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { LAUNCH_ROUTE_WHITELIST } from "@/lib/pwa/swRules";
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

  it("keeps the SW's cookie-header whitelist in sync with the shell's", () => {
    // launchTargetFromCookieHeader (swRules) must resolve the same targets the
    // shell's inline script does — otherwise the fresh-document 302 shortcut
    // would bypass the shell for a page the shell itself wouldn't pick.
    expect(new Set(LAUNCH_ROUTE_WHITELIST)).toEqual(new Set(shellRoutes()));
  });

  it("renders one skeleton section per dashboard view, month by default", () => {
    // The shell mirrors dashboard/loading.tsx + calendarSkeleton.tsx so the
    // handoff reads as one continuous skeleton; the variant chosen is driven
    // by the remembered dashboard.view (main[data-view], default "month").
    expect(SHELL_HTML).toContain('id="c2-main" data-view="month"');
    for (const view of ["month", "week", "weekv2", "agenda", "schedule"]) {
      expect(SHELL_HTML).toContain(`data-variant="${view}"`);
    }
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
