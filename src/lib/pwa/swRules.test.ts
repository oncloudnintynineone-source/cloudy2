import { describe, expect, it } from "vitest";

import {
  APP_DOCUMENT_CACHE_PREFIX,
  APP_RSC_CACHE_PREFIX,
  documentCacheName,
  DOCUMENT_FRESH_WINDOW_MS,
  isCacheableDocumentRequest,
  isDocumentFresh,
  isCacheableRscRequest,
  isPageCacheName,
  isSessionExpiredResponse,
  isStartUrlRequest,
  INACTIVITY_REFRESH_MS,
  keysForPathname,
  needsInactivityRefresh,
  needsReconcile,
  newestSavedView,
  rscCacheName,
  shouldPromptForUpdate,
  shouldStoreDocumentResponse,
  shouldStoreRscResponse,
  stampDocument,
  SW_UPDATE_CHECK_INTERVAL_MS,
  SW_UPDATE_PROMPT_GRACE_MS,
  swCacheVersion,
} from "./swRules";

const ORIGIN = "https://cloudy.example.com";

describe("swRules", () => {
  it("exports cache name prefixes", () => {
    expect(APP_DOCUMENT_CACHE_PREFIX).toBe("app-documents-swr");
    expect(APP_RSC_CACHE_PREFIX).toBe("app-rsc-swr");
  });

  describe("swCacheVersion", () => {
    const manifestA = [
      "/_next/static/chunks/abc123.js",
      { url: "/_next/static/chunks/def456.js", revision: null },
      "/offline.html",
    ];
    const manifestB = [
      "/_next/static/chunks/zzz999.js",
      { url: "/_next/static/chunks/yyy888.js", revision: null },
      "/offline.html",
    ];

    it("is deterministic for the same manifest", () => {
      expect(swCacheVersion(manifestA)).toBe(swCacheVersion(manifestA));
    });

    it("differs for different manifests", () => {
      expect(swCacheVersion(manifestA)).not.toBe(swCacheVersion(manifestB));
    });

    it("is stable for a missing manifest", () => {
      expect(swCacheVersion(undefined)).toBe(swCacheVersion(undefined));
      expect(swCacheVersion(null)).toBe(swCacheVersion(undefined));
    });

    it("produces a short alphanumeric token", () => {
      expect(swCacheVersion(manifestA)).toMatch(/^[1-9a-z]+$/);
      expect(swCacheVersion(manifestA).length).toBeLessThanOrEqual(7);
    });
  });

  describe("cache name derivation", () => {
    it("appends the version to the prefix", () => {
      expect(documentCacheName("abc12")).toBe("app-documents-swr-vabc12");
      expect(rscCacheName("abc12")).toBe("app-rsc-swr-vabc12");
    });

    it("document and RSC names never collide", () => {
      expect(documentCacheName("x")).not.toBe(rscCacheName("x"));
    });
  });

  describe("isPageCacheName", () => {
    it("matches versioned and legacy unversioned names", () => {
      expect(isPageCacheName("app-documents-swr")).toBe(true);
      expect(isPageCacheName("app-documents-swr-vabc12")).toBe(true);
      expect(isPageCacheName("app-rsc-swr")).toBe(true);
      expect(isPageCacheName("app-rsc-swr-vabc12")).toBe(true);
    });

    it("rejects other caches", () => {
      expect(isPageCacheName("static-image-assets")).toBe(false);
      expect(isPageCacheName("static-style-assets")).toBe(false);
      expect(isPageCacheName("serwist-precache-v2-abc")).toBe(false);
      expect(isPageCacheName("")).toBe(false);
    });
  });

  describe("isCacheableDocumentRequest", () => {
    it("allows protected pages", () => {
      expect(isCacheableDocumentRequest(new URL(`${ORIGIN}/dashboard`), ORIGIN)).toBe(true);
      expect(isCacheableDocumentRequest(new URL(`${ORIGIN}/dashboard?view=month`), ORIGIN)).toBe(
        true,
      );
      expect(isCacheableDocumentRequest(new URL(`${ORIGIN}/parade-state`), ORIGIN)).toBe(true);
      expect(isCacheableDocumentRequest(new URL(`${ORIGIN}/contacts`), ORIGIN)).toBe(true);
      expect(isCacheableDocumentRequest(new URL(`${ORIGIN}/settings/users`), ORIGIN)).toBe(true);
    });

    it("rejects excluded paths", () => {
      expect(isCacheableDocumentRequest(new URL(`${ORIGIN}/login`), ORIGIN)).toBe(false);
      expect(isCacheableDocumentRequest(new URL(`${ORIGIN}/api/audit/export`), ORIGIN)).toBe(false);
      expect(isCacheableDocumentRequest(new URL(`${ORIGIN}/serwist/sw.js`), ORIGIN)).toBe(false);
      expect(isCacheableDocumentRequest(new URL(`${ORIGIN}/_next/static/chunk.js`), ORIGIN)).toBe(
        false,
      );
    });

    it("rejects cross-origin", () => {
      expect(isCacheableDocumentRequest(new URL("https://evil.com/dashboard"), ORIGIN)).toBe(false);
    });
  });

  describe("isCacheableRscRequest", () => {
    const h = (v: string | null) => ({ get: () => v }) as unknown as Headers;

    it("requires RSC header", () => {
      expect(isCacheableRscRequest(new URL(`${ORIGIN}/dashboard`), ORIGIN, h(null))).toBe(false);
      expect(isCacheableRscRequest(new URL(`${ORIGIN}/dashboard`), ORIGIN, h("0"))).toBe(false);
      expect(isCacheableRscRequest(new URL(`${ORIGIN}/dashboard`), ORIGIN, h("1"))).toBe(true);
    });

    it("still excludes login/api/serwist", () => {
      expect(isCacheableRscRequest(new URL(`${ORIGIN}/login`), ORIGIN, h("1"))).toBe(false);
      expect(isCacheableRscRequest(new URL(`${ORIGIN}/api/audit/export`), ORIGIN, h("1"))).toBe(
        false,
      );
    });
  });

  describe("shouldStoreDocumentResponse", () => {
    it("accepts 200 text/html", () => {
      expect(
        shouldStoreDocumentResponse({
          status: 200,
          finalUrl: `${ORIGIN}/dashboard`,
          requestUrl: `${ORIGIN}/dashboard`,
          contentType: "text/html; charset=utf-8",
          origin: ORIGIN,
        }),
      ).toBe(true);
    });

    it("rejects non-200", () => {
      expect(
        shouldStoreDocumentResponse({
          status: 304,
          finalUrl: `${ORIGIN}/dashboard`,
          requestUrl: `${ORIGIN}/dashboard`,
          contentType: "text/html",
          origin: ORIGIN,
        }),
      ).toBe(false);
    });

    it("rejects non-html content-type", () => {
      expect(
        shouldStoreDocumentResponse({
          status: 200,
          finalUrl: `${ORIGIN}/dashboard`,
          requestUrl: `${ORIGIN}/dashboard`,
          contentType: "application/json",
          origin: ORIGIN,
        }),
      ).toBe(false);
    });

    it("rejects login redirect", () => {
      expect(
        shouldStoreDocumentResponse({
          status: 200,
          finalUrl: `${ORIGIN}/login`,
          requestUrl: `${ORIGIN}/dashboard`,
          contentType: "text/html",
          origin: ORIGIN,
        }),
      ).toBe(false);
    });

    it("rejects excluded request path", () => {
      expect(
        shouldStoreDocumentResponse({
          status: 200,
          finalUrl: `${ORIGIN}/api/audit/export`,
          requestUrl: `${ORIGIN}/api/audit/export`,
          contentType: "text/html",
          origin: ORIGIN,
        }),
      ).toBe(false);
    });

    it("rejects one-shot params (refresh/edit/event/_fresh)", () => {
      for (const query of ["refresh=123", "edit=abc-123", "event=abc-123", "_fresh=1"]) {
        expect(
          shouldStoreDocumentResponse({
            status: 200,
            finalUrl: `${ORIGIN}/dashboard`,
            requestUrl: `${ORIGIN}/dashboard?${query}`,
            contentType: "text/html",
            origin: ORIGIN,
          }),
        ).toBe(false);
      }
    });

    it("accepts ordinary query params", () => {
      expect(
        shouldStoreDocumentResponse({
          status: 200,
          finalUrl: `${ORIGIN}/dashboard`,
          requestUrl: `${ORIGIN}/dashboard?view=month&date=2026-08-01`,
          contentType: "text/html",
          origin: ORIGIN,
        }),
      ).toBe(true);
    });
  });

  describe("shouldStoreRscResponse", () => {
    it("accepts 200 text/x-component", () => {
      expect(
        shouldStoreRscResponse({
          status: 200,
          finalUrl: `${ORIGIN}/dashboard`,
          requestUrl: `${ORIGIN}/dashboard`,
          contentType: "text/x-component",
          origin: ORIGIN,
        }),
      ).toBe(true);
    });

    it("rejects html", () => {
      expect(
        shouldStoreRscResponse({
          status: 200,
          finalUrl: `${ORIGIN}/dashboard`,
          requestUrl: `${ORIGIN}/dashboard`,
          contentType: "text/html",
          origin: ORIGIN,
        }),
      ).toBe(false);
    });

    it("rejects login redirect", () => {
      expect(
        shouldStoreRscResponse({
          status: 200,
          finalUrl: `${ORIGIN}/login`,
          requestUrl: `${ORIGIN}/dashboard`,
          contentType: "text/x-component",
          origin: ORIGIN,
        }),
      ).toBe(false);
    });

    it("rejects one-shot params (refresh/edit/event/_fresh)", () => {
      for (const query of ["refresh=123", "edit=abc-123", "event=abc-123", "_fresh=1"]) {
        expect(
          shouldStoreRscResponse({
            status: 200,
            finalUrl: `${ORIGIN}/dashboard`,
            requestUrl: `${ORIGIN}/dashboard?${query}`,
            contentType: "text/x-component",
            origin: ORIGIN,
          }),
        ).toBe(false);
      }
    });
  });

  describe("isSessionExpiredResponse", () => {
    it("detects login final url", () => {
      expect(
        isSessionExpiredResponse({
          status: 200,
          finalUrl: `${ORIGIN}/login`,
          requestUrl: `${ORIGIN}/dashboard`,
          contentType: "text/html",
          origin: ORIGIN,
        }),
      ).toBe(true);
      expect(
        isSessionExpiredResponse({
          status: 200,
          finalUrl: `${ORIGIN}/login?callbackUrl=%2Fdashboard`,
          requestUrl: `${ORIGIN}/dashboard`,
          contentType: "text/html",
          origin: ORIGIN,
        }),
      ).toBe(true);
    });

    it("not expired for normal page", () => {
      expect(
        isSessionExpiredResponse({
          status: 200,
          finalUrl: `${ORIGIN}/dashboard`,
          requestUrl: `${ORIGIN}/dashboard`,
          contentType: "text/html",
          origin: ORIGIN,
        }),
      ).toBe(false);
    });
  });

  describe("keysForPathname", () => {
    it("filters by pathname", () => {
      const keys = [
        `${ORIGIN}/dashboard?view=month&_rsc=abc`,
        `${ORIGIN}/dashboard?view=week&_rsc=def`,
        `${ORIGIN}/settings/users?_rsc=xyz`,
        `${ORIGIN}/dashboard`,
      ];
      expect(keysForPathname(keys, ORIGIN, "/dashboard")).toEqual([
        `${ORIGIN}/dashboard?view=month&_rsc=abc`,
        `${ORIGIN}/dashboard?view=week&_rsc=def`,
        `${ORIGIN}/dashboard`,
      ]);
    });

    it("excludes cross-origin", () => {
      expect(keysForPathname(["https://evil.com/dashboard"], ORIGIN, "/dashboard")).toEqual([]);
    });
  });

  describe("newestSavedView", () => {
    it("returns null for an empty list", () => {
      expect(newestSavedView([])).toBeNull();
    });

    it("picks the newest by savedAtMs", () => {
      expect(
        newestSavedView([
          { url: `${ORIGIN}/dashboard`, savedAtMs: 1000 },
          { url: `${ORIGIN}/parade-state`, savedAtMs: 3000 },
          { url: `${ORIGIN}/contacts`, savedAtMs: 2000 },
        ]),
      ).toEqual({ url: `${ORIGIN}/parade-state`, savedAtMs: 3000 });
    });

    it("treats missing timestamps as oldest", () => {
      expect(
        newestSavedView([
          { url: `${ORIGIN}/a`, savedAtMs: null },
          { url: `${ORIGIN}/b`, savedAtMs: 5 },
        ]),
      ).toEqual({ url: `${ORIGIN}/b`, savedAtMs: 5 });
    });

    it("breaks ties toward the first entry", () => {
      expect(
        newestSavedView([
          { url: `${ORIGIN}/a`, savedAtMs: 1000 },
          { url: `${ORIGIN}/b`, savedAtMs: 1000 },
        ]),
      ).toEqual({ url: `${ORIGIN}/a`, savedAtMs: 1000 });
    });

    it("returns the only entry even without a timestamp", () => {
      expect(newestSavedView([{ url: `${ORIGIN}/a`, savedAtMs: null }])).toEqual({
        url: `${ORIGIN}/a`,
        savedAtMs: null,
      });
    });
  });

  describe("isDocumentFresh", () => {
    const now = 1_000_000_000;

    it("is not fresh without a timestamp (no entry, or no Date header)", () => {
      expect(isDocumentFresh(null, now)).toBe(false);
    });

    it("is fresh for a just-stored document", () => {
      expect(isDocumentFresh(now, now)).toBe(true);
    });

    it("is fresh just inside the window", () => {
      expect(isDocumentFresh(now - DOCUMENT_FRESH_WINDOW_MS + 1, now)).toBe(true);
    });

    it("is stale exactly at the window (exclusive)", () => {
      expect(isDocumentFresh(now - DOCUMENT_FRESH_WINDOW_MS, now)).toBe(false);
    });

    it("is stale past the window", () => {
      expect(isDocumentFresh(now - DOCUMENT_FRESH_WINDOW_MS - 1, now)).toBe(false);
      expect(isDocumentFresh(now - 24 * 60 * 60_000, now)).toBe(false);
    });

    it("treats a future timestamp (clock skew) as age 0, not ancient", () => {
      expect(isDocumentFresh(now + 60_000, now)).toBe(true);
    });
  });

  describe("isStartUrlRequest", () => {
    it("matches the bare root", () => {
      expect(isStartUrlRequest(new URL(`${ORIGIN}/`))).toBe(true);
    });

    it("still matches a root the launcher tagged with utm params", () => {
      // Chrome/Android can append these to the start URL; refusing them used to
      // drop the launch onto the blocking document route.
      expect(isStartUrlRequest(new URL(`${ORIGIN}/?utm_source=homescreen`))).toBe(true);
      expect(
        isStartUrlRequest(
          new URL(`${ORIGIN}/?utm_source=androidhome&utm_medium=app&utm_campaign=x`),
        ),
      ).toBe(true);
      expect(isStartUrlRequest(new URL(`${ORIGIN}/?UTM_source=x`))).toBe(true);
    });

    it("rejects query-bearing roots with any other param", () => {
      expect(isStartUrlRequest(new URL(`${ORIGIN}/?view=week`))).toBe(false);
      expect(isStartUrlRequest(new URL(`${ORIGIN}/?refresh=123`))).toBe(false);
      expect(isStartUrlRequest(new URL(`${ORIGIN}/?utm_source=x&edit=1`))).toBe(false);
    });

    it("ignores the hash and rejects other paths", () => {
      expect(isStartUrlRequest(new URL(`${ORIGIN}/#x`))).toBe(true);
      expect(isStartUrlRequest(new URL(`${ORIGIN}/dashboard`))).toBe(false);
      expect(isStartUrlRequest(new URL(`${ORIGIN}/login`))).toBe(false);
    });
  });

  describe("needsReconcile", () => {
    const now = Date.parse("2026-03-04T05:06:07.000Z");

    it("never reconciles an unstamped document (it came off the network)", () => {
      expect(needsReconcile(null, now)).toBe(false);
      expect(needsReconcile(undefined, now)).toBe(false);
      expect(needsReconcile("", now)).toBe(false);
    });

    it("never reconciles a stamp inside the fresh window", () => {
      expect(needsReconcile(new Date(now - 1000).toISOString(), now)).toBe(false);
      expect(
        needsReconcile(new Date(now - DOCUMENT_FRESH_WINDOW_MS + 1).toISOString(), now),
      ).toBe(false);
    });

    it("reconciles a stamp at or beyond the window", () => {
      expect(
        needsReconcile(new Date(now - DOCUMENT_FRESH_WINDOW_MS).toISOString(), now),
      ).toBe(true);
      expect(needsReconcile(new Date(now - 86_400_000).toISOString(), now)).toBe(true);
    });

    it("treats an unparsable stamp as fresh rather than hammering the network", () => {
      expect(needsReconcile("not-a-date", now)).toBe(false);
    });

    it("clamps a future stamp (clock skew) to age 0", () => {
      expect(needsReconcile(new Date(now + 60_000).toISOString(), now)).toBe(false);
    });
  });

  describe("needsInactivityRefresh", () => {
    it("does not refresh a brief (sub-window) absence", () => {
      expect(needsInactivityRefresh(0)).toBe(false);
      expect(needsInactivityRefresh(INACTIVITY_REFRESH_MS - 1)).toBe(false);
    });

    it("refreshes at or beyond the window", () => {
      expect(needsInactivityRefresh(INACTIVITY_REFRESH_MS)).toBe(true);
      expect(needsInactivityRefresh(INACTIVITY_REFRESH_MS + 1)).toBe(true);
      expect(needsInactivityRefresh(24 * 60 * 60_000)).toBe(true);
    });

    it("refuses a negative duration (clock skew)", () => {
      expect(needsInactivityRefresh(-1)).toBe(false);
    });
  });

  describe("stampDocument", () => {
    it("injects after <head>", () => {
      const html = "<html><head><title>x</title></head><body></body></html>";
      const out = stampDocument(html, "2026-01-02T03:04:05.000Z");
      expect(out).toContain('window.__C2_STAMP__');
      expect(out).toContain("2026-01-02T03:04:05.000Z");
      expect(out.indexOf("__C2_STAMP__")).toBeGreaterThan(out.indexOf("<head>"));
      expect(out.indexOf("__C2_STAMP__")).toBeLessThan(out.indexOf("</head>"));
    });

    it("prepends when no head", () => {
      const out = stampDocument("<html>hi</html>", "2026-01-02T03:04:05.000Z");
      expect(out.startsWith("<script>")).toBe(true);
      expect(out).toContain("__C2_STAMP__");
    });

    it("replaces an existing stamp instead of stacking", () => {
      const once = stampDocument("<html><head></head><body></body></html>", "2026-01-01T00:00:00.000Z");
      const twice = stampDocument(once, "2026-02-01T00:00:00.000Z");
      expect(twice.match(/__C2_STAMP__/g)).toHaveLength(1);
      expect(twice).toContain("2026-02-01T00:00:00.000Z");
      expect(twice).not.toContain("2026-01-01T00:00:00.000Z");
    });
  });

  describe("shouldPromptForUpdate", () => {
    it("prompts for a waiting worker on a controlled page", () => {
      expect(
        shouldPromptForUpdate({ hasController: true, hasWaiting: true, alreadyPrompted: false }),
      ).toBe(true);
    });

    it("never prompts on a first install (no controller)", () => {
      expect(
        shouldPromptForUpdate({ hasController: false, hasWaiting: true, alreadyPrompted: false }),
      ).toBe(false);
    });

    it("does not prompt without a waiting worker", () => {
      expect(
        shouldPromptForUpdate({ hasController: true, hasWaiting: false, alreadyPrompted: false }),
      ).toBe(false);
    });

    it("does not stack a second prompt for the same worker", () => {
      expect(
        shouldPromptForUpdate({ hasController: true, hasWaiting: true, alreadyPrompted: true }),
      ).toBe(false);
    });
  });

  describe("update timing constants", () => {
    it("polls for updates well within a long session", () => {
      expect(SW_UPDATE_CHECK_INTERVAL_MS).toBe(15 * 60_000);
    });

    it("warns for a meaningful grace period before applying", () => {
      expect(SW_UPDATE_PROMPT_GRACE_MS).toBe(30_000);
    });
  });
});
