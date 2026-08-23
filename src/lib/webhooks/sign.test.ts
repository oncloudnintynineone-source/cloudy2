import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { webhookSignature } from "./sign";

describe("webhookSignature", () => {
  it("matches a locally computed HMAC-SHA256 over timestamp.body", () => {
    const expected = createHmac("sha256", "s3cret")
      .update("1700000000.{\"hello\":\"world\"}")
      .digest("hex");
    expect(webhookSignature("s3cret", "1700000000", '{"hello":"world"}')).toBe(expected);
  });

  it("is deterministic for identical inputs", () => {
    expect(webhookSignature("s3cret", "1", "a")).toBe(webhookSignature("s3cret", "1", "a"));
  });

  it("differs when the body changes", () => {
    expect(webhookSignature("s3cret", "1", "a")).not.toBe(webhookSignature("s3cret", "1", "b"));
  });

  it("differs when the timestamp changes (replay binding)", () => {
    expect(webhookSignature("s3cret", "1", "a")).not.toBe(webhookSignature("s3cret", "2", "a"));
  });

  it("differs when the secret changes", () => {
    expect(webhookSignature("s3cret", "1", "a")).not.toBe(webhookSignature("other", "1", "a"));
  });

  it("binds the timestamp into the signed material, not just the body", () => {
    const body = "a";
    const withSeparator = webhookSignature("s3cret", "1", body);
    const bodyOnly = createHmac("sha256", "s3cret").update(body).digest("hex");
    expect(withSeparator).not.toBe(bodyOnly);
  });
});
