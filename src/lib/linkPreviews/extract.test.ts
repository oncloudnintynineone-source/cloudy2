import { describe, expect, it } from "vitest";

import {
  MAX_PREVIEW_URLS,
  extractPreviewUrls,
  normalizeCandidate,
  splitRemarksUrls,
} from "./extract";

describe("normalizeCandidate", () => {
  it("keeps absolute http(s) URLs and normalizes them", () => {
    expect(normalizeCandidate("https://x.com/a")).toBe("https://x.com/a");
    expect(normalizeCandidate("HTTP://X.com/A")).toBe("http://x.com/A");
  });

  it("prepends the scheme to www. hosts", () => {
    expect(normalizeCandidate("www.example.com")).toBe("https://www.example.com/");
    expect(normalizeCandidate("WWW.example.com/path")).toBe("https://www.example.com/path");
  });

  it("trims trailing sentence punctuation", () => {
    expect(normalizeCandidate("https://x.com/a.")).toBe("https://x.com/a");
    expect(normalizeCandidate("https://x.com/a,")).toBe("https://x.com/a");
    expect(normalizeCandidate("https://x.com/a!")).toBe("https://x.com/a");
    expect(normalizeCandidate("https://x.com/a)")).toBe("https://x.com/a");
    expect(normalizeCandidate("https://x.com/a].")).toBe("https://x.com/a");
  });

  it("keeps balanced brackets", () => {
    expect(normalizeCandidate("https://x.com/a(b)")).toBe("https://x.com/a(b)");
    expect(normalizeCandidate("https://x.com/w/index.php?title=A_(B)")).toBe(
      "https://x.com/w/index.php?title=A_(B)",
    );
  });

  it("drops the fragment but keeps the query", () => {
    expect(normalizeCandidate("https://x.com/page#section")).toBe("https://x.com/page");
    expect(normalizeCandidate("https://x.com/page?q=1#s")).toBe("https://x.com/page?q=1");
  });

  it("rejects non-URLs and non-http(s) schemes", () => {
    expect(normalizeCandidate("mailto:me@example.com")).toBeNull();
    expect(normalizeCandidate("example.com/no-scheme")).toBeNull();
    expect(normalizeCandidate("")).toBeNull();
  });
});

describe("splitRemarksUrls", () => {
  it("splits text around a URL and returns trimmed punctuation to the text", () => {
    expect(splitRemarksUrls("See https://x.com/a. Thanks")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: "https://x.com/a", href: "https://x.com/a" },
      { kind: "text", text: ". Thanks" },
    ]);
  });

  it("keeps plain text untouched", () => {
    expect(splitRemarksUrls("Wear whites.\nBring ID.")).toEqual([
      { kind: "text", text: "Wear whites.\nBring ID." },
    ]);
  });

  it("handles a bare www. mention at the start", () => {
    expect(splitRemarksUrls("www.google.com is the link")).toEqual([
      { kind: "link", text: "www.google.com", href: "https://www.google.com/" },
      { kind: "text", text: " is the link" },
    ]);
  });

  it("leaves scheme-less domains as text", () => {
    expect(splitRemarksUrls("mail me at name@example.com ok")).toEqual([
      { kind: "text", text: "mail me at name@example.com ok" },
    ]);
  });
});

describe("extractPreviewUrls", () => {
  it("returns unique URLs in order, deduping fragments", () => {
    expect(extractPreviewUrls("https://b.com/1 then https://a.com then https://b.com/1#x")).toEqual(
      ["https://b.com/1", "https://a.com/"],
    );
  });

  it("caps at the shared maximum", () => {
    const text = Array.from(
      { length: MAX_PREVIEW_URLS + 2 },
      (_, index) => `https://example.com/${index}`,
    ).join(" and ");
    expect(extractPreviewUrls(text)).toHaveLength(MAX_PREVIEW_URLS);
  });

  it("returns nothing for URL-free remarks", () => {
    expect(extractPreviewUrls("no links here")).toEqual([]);
  });
});
