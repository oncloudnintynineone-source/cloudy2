import { describe, expect, it } from "vitest";

import { parseOpenGraphMeta } from "./parse";

const BASE = "https://example.com/some/page";

describe("parseOpenGraphMeta", () => {
  it("reads the og: fields", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Morning Parade" />
        <meta property="og:description" content="Assemble at the square" />
        <meta property="og:image" content="https://cdn.example.com/og.png" />
        <meta property="og:site_name" content="Example" />
      </head><body><title>Fallback</title></body></html>`;
    expect(parseOpenGraphMeta(html, BASE)).toEqual({
      title: "Morning Parade",
      description: "Assemble at the square",
      image: "https://cdn.example.com/og.png",
      siteName: "Example",
    });
  });

  it("tolerates single quotes, unquoted values and reversed attribute order", () => {
    const html = `
      <meta content='Single Quoted' property='og:title'>
      <meta property=og:description content=Unquoted>`;
    expect(parseOpenGraphMeta(html, BASE)).toEqual({
      title: "Single Quoted",
      description: "Unquoted",
    });
  });

  it("falls back through twitter: then the document title and description", () => {
    const twitter = `<meta name="twitter:title" content="T"><meta name="twitter:description" content="D"><meta name="twitter:image" content="https://cdn.example.com/t.png">`;
    expect(parseOpenGraphMeta(twitter, BASE)).toEqual({
      title: "T",
      description: "D",
      image: "https://cdn.example.com/t.png",
    });
    const plain = `<title>Doc <b>Title</b></title><meta name="description" content="Plain">`;
    expect(parseOpenGraphMeta(plain, BASE)).toEqual({
      title: "Doc Title",
      description: "Plain",
    });
  });

  it("keeps the first value of duplicated keys", () => {
    const html = `<meta property="og:title" content="First"><meta property="og:title" content="Second">`;
    expect(parseOpenGraphMeta(html, BASE).title).toBe("First");
  });

  it("decodes the entities that show up in meta content", () => {
    const html = `<meta property="og:title" content="Ben &amp; Jerry&#39;s — &#x27;quoted&#39; &quot;stuff&quot;">`;
    expect(parseOpenGraphMeta(html, BASE).title).toBe("Ben & Jerry's — 'quoted' \"stuff\"");
  });

  it("truncates long fields with an ellipsis", () => {
    const long = "x".repeat(300);
    const meta = parseOpenGraphMeta(`<meta property="og:title" content="${long}">`, BASE);
    expect(meta.title).toHaveLength(120);
    expect(meta.title?.endsWith("…")).toBe(true);
  });

  it("resolves relative images against the page URL", () => {
    const html = `<meta property="og:image" content="/img/og.png">`;
    expect(parseOpenGraphMeta(html, BASE).image).toBe("https://example.com/img/og.png");
  });

  it("drops images that fail the SSRF gate", () => {
    const html = `<meta property="og:image" content="http://169.254.169.254/latest/meta-data.png">`;
    expect(parseOpenGraphMeta(html, BASE).image).toBeUndefined();
  });

  it("ignores empty content and unrelated tags", () => {
    const html = `<meta property="og:title" content="   "><meta charset="utf-8">`;
    expect(parseOpenGraphMeta(html, BASE)).toEqual({});
  });
});
