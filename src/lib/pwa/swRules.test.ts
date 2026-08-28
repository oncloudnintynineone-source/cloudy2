import { describe, expect, it } from "vitest";

import {
  APP_DOCUMENT_CACHE,
  APP_RSC_CACHE,
  isCacheableDocumentRequest,
  isCacheableRscRequest,
  isSessionExpiredResponse,
  keysForPathname,
  shouldStoreDocumentResponse,
  shouldStoreRscResponse,
  stampDocument,
} from "./swRules";

const ORIGIN = "https://cloudy.example.com";

describe("swRules", () => {
  it("exports cache names", () => {
    expect(APP_DOCUMENT_CACHE).toBe("app-documents-swr");
    expect(APP_RSC_CACHE).toBe("app-rsc-swr");
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
  });
});
