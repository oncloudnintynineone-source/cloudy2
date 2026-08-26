import { describe, expect, it } from "vitest";

import { buildTextEmail } from "./mime";

function decode(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf8");
}

describe("buildTextEmail", () => {
  it("builds a base64url RFC 822 message with headers and CRLF body", () => {
    const raw = decode(
      buildTextEmail({ to: ["a@x.com", "b@y.com"], subject: "KAH limit exceeded", body: "line1\nline2" }),
    );
    expect(raw).toContain("To: a@x.com, b@y.com\r\n");
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"\r\n');
    expect(raw).toContain("MIME-Version: 1.0\r\n");
    expect(raw.endsWith("line1\r\nline2")).toBe(true);
    // ASCII subjects pass through the encoded-word framing unchanged.
    expect(decode(raw.match(/Subject: =\?UTF-8\?B\?(.+?)\?=/)![1].replace(/\r\n /g, ""))).toBe(
      "KAH limit exceeded",
    );
  });

  it("encodes non-ASCII subjects as UTF-8 encoded-words", () => {
    const raw = decode(buildTextEmail({ to: ["a@x.com"], subject: "Kah – ünïcode ✓", body: "b" }));
    const encoded = raw.split("\r\n").find((line) => line.startsWith("Subject:"))!;
    expect(encoded).toContain("=?UTF-8?B?");
    // Decoding every chunk recovers the original subject.
    const text = encoded
      .slice("Subject: ".length)
      .split(/=\?UTF-8\?B\?|\?=/)
      .filter((chunk) => chunk && chunk !== "\r" && chunk !== " ")
      .map((chunk) => Buffer.from(chunk.replace(/^\r\n /, ""), "base64").toString("utf8"))
      .join("");
    expect(text).toContain("ünïcode");
  });

  it("drops blank recipients and normalizes lone newlines", () => {
    const raw = decode(
      buildTextEmail({ to: ["a@x.com", " ", ""], subject: "s", body: "a\nb\rc" }),
    );
    expect(raw).toContain("To: a@x.com\r\n");
    // Every newline is CRLF — no bare LF or lone CR survives.
    expect(raw.match(/(?<!\r)\n|\r(?!\n)/g)).toBeNull();
  });
});
