import { describe, expect, it } from "vitest";

import {
  MAX_PREVIEW_URLS,
  extractPreviewUrls,
  normalizeCandidate,
  previewUrlFor,
  splitRemarksUrls,
} from "./extract";

describe("normalizeCandidate", () => {
  it("keeps absolute http(s) URLs and normalizes them", () => {
    expect(normalizeCandidate("https://x.com/a")).toBe("https://x.com/a");
    expect(normalizeCandidate("HTTP://X.com/A")).toBe("http://x.com/A");
  });

  it("prepends the scheme to a bare host", () => {
    expect(normalizeCandidate("www.example.com")).toBe("https://www.example.com/");
    expect(normalizeCandidate("WWW.example.com/path")).toBe("https://www.example.com/path");
    expect(normalizeCandidate("example.com/no-scheme")).toBe("https://example.com/no-scheme");
    expect(normalizeCandidate("example.com:8080/x")).toBe("https://example.com:8080/x");
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

  it("keeps the fragment and the query", () => {
    expect(normalizeCandidate("https://x.com/page#section")).toBe("https://x.com/page#section");
    expect(normalizeCandidate("https://x.com/page?q=1#s")).toBe("https://x.com/page?q=1#s");
  });

  it("trims prose glued to the tail of a URL", () => {
    expect(normalizeCandidate("https://x.com/a的东西")).toBe("https://x.com/a");
    expect(normalizeCandidate("https://x.com/a’s")).toBe("https://x.com/a");
    expect(normalizeCandidate("https://x.com/a。")).toBe("https://x.com/a");
  });

  it("rejects non-URLs and non-http(s) schemes", () => {
    expect(normalizeCandidate("mailto:me@example.com")).toBeNull();
    expect(normalizeCandidate("javascript:alert(1)")).toBeNull();
    expect(normalizeCandidate("data:text/html,x")).toBeNull();
    expect(normalizeCandidate("file:///etc/passwd")).toBeNull();
    expect(normalizeCandidate("ftp://example.com")).toBeNull();
    expect(normalizeCandidate("https://")).toBeNull();
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

  it("linkifies a scheme-less host", () => {
    expect(splitRemarksUrls("see example.com/x for details")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "example.com/x", href: "https://example.com/x" },
      { kind: "text", text: " for details" },
    ]);
  });

  it("keeps the fragment on the link (so it lands on the right section)", () => {
    expect(splitRemarksUrls("sheet https://x.com/page#section")).toEqual([
      { kind: "text", text: "sheet " },
      { kind: "link", text: "https://x.com/page#section", href: "https://x.com/page#section" },
    ]);
  });

  it("splits two URLs glued together with a comma", () => {
    expect(splitRemarksUrls("https://a.com,https://b.com")).toEqual([
      { kind: "link", text: "https://a.com", href: "https://a.com/" },
      { kind: "text", text: "," },
      { kind: "link", text: "https://b.com", href: "https://b.com/" },
    ]);
    expect(
      splitRemarksUrls("https://a.com,https://b.com,https://c.com/x").filter(
        (segment) => segment.kind === "link",
      ),
    ).toHaveLength(3);
  });

  it("keeps a comma that is part of the URL", () => {
    expect(splitRemarksUrls("https://x.com/a,b")).toEqual([
      { kind: "link", text: "https://x.com/a,b", href: "https://x.com/a,b" },
    ]);
  });

  it("returns prose glued to the tail of a URL to the text", () => {
    expect(splitRemarksUrls("https://x.com/a的东西")).toEqual([
      { kind: "link", text: "https://x.com/a", href: "https://x.com/a" },
      { kind: "text", text: "的东西" },
    ]);
    expect(splitRemarksUrls("https://x.com/a’s page")).toEqual([
      { kind: "link", text: "https://x.com/a", href: "https://x.com/a" },
      { kind: "text", text: "’s page" },
    ]);
    expect(splitRemarksUrls("https://x.com/a。")).toEqual([
      { kind: "link", text: "https://x.com/a", href: "https://x.com/a" },
      { kind: "text", text: "。" },
    ]);
  });

  it("keeps balanced brackets and trims an unbalanced closing one", () => {
    expect(splitRemarksUrls("(www.x.com/path). thanks")).toEqual([
      { kind: "text", text: "(" },
      { kind: "link", text: "www.x.com/path", href: "https://www.x.com/path" },
      { kind: "text", text: "). thanks" },
    ]);
    expect(splitRemarksUrls("https://x.com/foo_(bar)")).toEqual([
      { kind: "link", text: "https://x.com/foo_(bar)", href: "https://x.com/foo_(bar)" },
    ]);
    expect(splitRemarksUrls("https://x.com/a].")).toEqual([
      { kind: "link", text: "https://x.com/a", href: "https://x.com/a" },
      { kind: "text", text: "]." },
    ]);
  });

  it("keeps an IDN host (punycoded) while trimming a prose tail", () => {
    expect(splitRemarksUrls("https://例え.jp/path")).toEqual([
      { kind: "link", text: "https://例え.jp/path", href: "https://xn--r8jz45g.jp/path" },
    ]);
    expect(splitRemarksUrls("https://例え.jp/路径")).toEqual([
      { kind: "link", text: "https://例え.jp/", href: "https://xn--r8jz45g.jp/" },
      { kind: "text", text: "路径" },
    ]);
  });

  it("leaves non-http schemes, emails and filenames as text", () => {
    expect(splitRemarksUrls("mail me at name@example.com ok")).toEqual([
      { kind: "text", text: "mail me at name@example.com ok" },
    ]);
    expect(splitRemarksUrls("see report.pdf and notes.txt")).toEqual([
      { kind: "text", text: "see report.pdf and notes.txt" },
    ]);
    for (const scheme of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "about:blank",
      "blob:https://x.com/uuid",
      "khttps://x.com/a",
    ]) {
      const text = `open ${scheme} now`;
      expect(splitRemarksUrls(text)).toEqual([{ kind: "text", text }]);
    }
  });

  it("never emits a non-http(s) href", () => {
    const text =
      "a https://x.com/p#f and javascript:alert(1) and www.y.com and data:text/html,x";
    const links = splitRemarksUrls(text).filter((segment) => segment.kind === "link");
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.kind === "link" && /^https?:\/\//.test(link.href)).toBe(true);
    }
  });

  it("leaves an over-long candidate as text", () => {
    const text = `https://x.com/${"a".repeat(2100)}`;
    expect(splitRemarksUrls(text)).toEqual([{ kind: "text", text }]);
  });
});

describe("previewUrlFor", () => {
  it("drops the fragment", () => {
    expect(previewUrlFor("https://x.com/page#section")).toBe("https://x.com/page");
  });

  it("returns the input when it cannot be parsed", () => {
    expect(previewUrlFor("not a url")).toBe("not a url");
  });
});

describe("extractPreviewUrls", () => {
  it("returns unique URLs in order, deduping fragments", () => {
    expect(extractPreviewUrls("https://b.com/1 then https://a.com then https://b.com/1#x")).toEqual(
      ["https://b.com/1", "https://a.com/"],
    );
  });

  it("counts two anchors of the same page once", () => {
    expect(extractPreviewUrls("https://a.com/#one and https://a.com/#two")).toEqual([
      "https://a.com/",
    ]);
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
