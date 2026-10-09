import { describe, expect, it } from "vitest";

import { isValidClientSubscription } from "./subscriptionInput";

const valid = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BNc...", auth: "k9..." },
};

describe("isValidClientSubscription", () => {
  it("accepts an https endpoint with non-empty keys", () => {
    expect(isValidClientSubscription(valid)).toBe(true);
  });

  it("rejects non-object inputs", () => {
    expect(isValidClientSubscription(null)).toBe(false);
    expect(isValidClientSubscription(undefined)).toBe(false);
    expect(isValidClientSubscription("nope")).toBe(false);
    expect(isValidClientSubscription(42)).toBe(false);
  });

  it("rejects a non-https endpoint", () => {
    expect(isValidClientSubscription({ ...valid, endpoint: "http://example.com" })).toBe(false);
    expect(isValidClientSubscription({ ...valid, endpoint: "" })).toBe(false);
    expect(isValidClientSubscription({ ...valid, endpoint: 123 })).toBe(false);
  });

  it("rejects missing, empty or non-string keys", () => {
    expect(isValidClientSubscription({ endpoint: valid.endpoint })).toBe(false);
    expect(isValidClientSubscription({ endpoint: valid.endpoint, keys: null })).toBe(false);
    expect(
      isValidClientSubscription({ endpoint: valid.endpoint, keys: { p256dh: "", auth: "k" } }),
    ).toBe(false);
    expect(
      isValidClientSubscription({ endpoint: valid.endpoint, keys: { p256dh: "p", auth: "" } }),
    ).toBe(false);
    expect(
      isValidClientSubscription({ endpoint: valid.endpoint, keys: { p256dh: "p" } }),
    ).toBe(false);
  });
});
