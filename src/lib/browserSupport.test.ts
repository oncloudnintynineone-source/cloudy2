import { describe, expect, it } from "vitest";

import { detectLegacyBrowser } from "./browserSupport";

const UA = {
  // The reported device: iPhone SE (1st gen) tops out at iOS 15.8.8.
  iphoneSe1Ios158:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.8 Mobile/15E148 Safari/604.1",
  ios164Safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1",
  ios175Safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadIos157:
    "Mozilla/5.0 (iPad; CPU OS 15_7_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Mobile/15E148 Safari/604.1",
  desktopSafari156:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15",
  desktopSafari164:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15",
  // iOS in-app WebView (WKWebView) — no Version/ token, no Chrome/ token;
  // only the OS token is usable.
  ios166WebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ios158WebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  // Chromium — the engine token is the signal, never the OS version.
  ios15Chrome108:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/108.0.5359.92 Mobile/15E148 Safari/604.1",
  ios16Chrome117:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/117.0.5905.110 Mobile/15E148 Safari/604.1",
  ios17Edge139:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 EdgiOS/139.0.3452.1",
  android6Chrome95:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5 Build/MMB13M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.74 Mobile Safari/537.36",
  // Android 7 tops out at Chrome 119 (updates ended Nov 2023) — still ≥ 111.
  android7Chrome119:
    "Mozilla/5.0 (Linux; Android 7.1.1; Nexus 5X Build/NMF26F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.66 Mobile Safari/537.36",
  // Android 8/9 top out at Chrome 138 (updates ended Aug 2025) — still ≥ 111.
  android8Chrome138:
    "Mozilla/5.0 (Linux; Android 8.1.0; SM-G930F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.180 Mobile Safari/537.36",
  android12Chrome149:
    "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.100 Mobile Safari/537.36",
  // A newer OS with a frozen-out-old engine must still be flagged (engine,
  // not OS, is the gate).
  android12Chrome95:
    "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.74 Mobile Safari/537.36",
  desktopChrome110:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
  desktopChrome149:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  // Old AOSP stock browser — carries a low Chrome/ token.
  android5StockChrome37:
    "Mozilla/5.0 (Linux; Android 5.1.1; SM-G900F Build/LMY47X) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/37.0.0.0 Mobile Safari/537.36",
  // Edge (Chromium) — the Chrome/ token precedes Edg/ in the UA.
  desktopEdge97:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36 Edg/97.0.4692.71",
  desktopEdge124:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  firefox110: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:110.0) Gecko/20100101 Firefox/110.0",
  firefox115: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

describe("detectLegacyBrowser", () => {
  it("flags the reported device (iPhone SE 1st gen, iOS 15.8.8 Safari) as legacy", () => {
    expect(detectLegacyBrowser(UA.iphoneSe1Ios158)).toBe(true);
  });

  it("flags WebKit below Safari 16.4 (iOS/iPadOS/macOS, incl. WKWebView)", () => {
    expect(detectLegacyBrowser(UA.ios158WebView)).toBe(true);
    expect(detectLegacyBrowser(UA.ipadIos157)).toBe(true);
    expect(detectLegacyBrowser(UA.desktopSafari156)).toBe(true);
  });

  it("supports WebKit at and above Safari 16.4", () => {
    expect(detectLegacyBrowser(UA.ios164Safari)).toBe(false);
    expect(detectLegacyBrowser(UA.ios175Safari)).toBe(false);
    expect(detectLegacyBrowser(UA.ios166WebView)).toBe(false);
    expect(detectLegacyBrowser(UA.desktopSafari164)).toBe(false);
  });

  it("flags Chromium below 111 (incl. iOS Chrome and Android stock)", () => {
    expect(detectLegacyBrowser(UA.ios15Chrome108)).toBe(true);
    expect(detectLegacyBrowser(UA.android6Chrome95)).toBe(true);
    expect(detectLegacyBrowser(UA.android12Chrome95)).toBe(true);
    expect(detectLegacyBrowser(UA.desktopChrome110)).toBe(true);
    expect(detectLegacyBrowser(UA.desktopEdge97)).toBe(true);
    expect(detectLegacyBrowser(UA.android5StockChrome37)).toBe(true);
  });

  it("supports Chromium at and above 111 regardless of the OS version", () => {
    expect(detectLegacyBrowser(UA.ios16Chrome117)).toBe(false);
    expect(detectLegacyBrowser(UA.ios17Edge139)).toBe(false);
    expect(detectLegacyBrowser(UA.android7Chrome119)).toBe(false);
    expect(detectLegacyBrowser(UA.android8Chrome138)).toBe(false);
    expect(detectLegacyBrowser(UA.android12Chrome149)).toBe(false);
    expect(detectLegacyBrowser(UA.desktopChrome149)).toBe(false);
    expect(detectLegacyBrowser(UA.desktopEdge124)).toBe(false);
  });

  it("flags Firefox below 111 and supports it at and above", () => {
    expect(detectLegacyBrowser(UA.firefox110)).toBe(true);
    expect(detectLegacyBrowser(UA.firefox115)).toBe(false);
  });

  it("fails open: missing, empty, or unrecognised UAs are treated as supported", () => {
    expect(detectLegacyBrowser(null)).toBe(false);
    expect(detectLegacyBrowser(undefined)).toBe(false);
    expect(detectLegacyBrowser("")).toBe(false);
    expect(detectLegacyBrowser("   ")).toBe(false);
    expect(detectLegacyBrowser("not a user agent at all")).toBe(false);
    expect(detectLegacyBrowser(UA.googlebot)).toBe(false);
  });
});
