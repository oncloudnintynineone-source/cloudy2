import { describe, expect, it } from "vitest";

import {
  feedSignature,
  parseFeedVersion,
  signFeedUrl,
  verifyFeedSignature,
} from "./feedToken";

const SECRET = "test-secret";
const USER = "11111111-1111-1111-1111-111111111111";
const VIEW = "22222222-2222-2222-2222-222222222222";

describe("feedSignature / verifyFeedSignature", () => {
  it("accepts the matching signature", () => {
    const signature = feedSignature(SECRET, USER, 0, VIEW);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      verifyFeedSignature({ secret: SECRET, userId: USER, version: 0, viewId: VIEW, signature }),
    ).toBe(true);
  });

  it("binds the user, version and view", () => {
    const signature = feedSignature(SECRET, USER, 3, VIEW);
    expect(
      verifyFeedSignature({ secret: SECRET, userId: USER, version: 4, viewId: VIEW, signature }),
    ).toBe(false);
    expect(
      verifyFeedSignature({
        secret: SECRET,
        userId: "33333333-3333-3333-3333-333333333333",
        version: 3,
        viewId: VIEW,
        signature,
      }),
    ).toBe(false);
    expect(
      verifyFeedSignature({
        secret: SECRET,
        userId: USER,
        version: 3,
        viewId: "44444444-4444-4444-4444-444444444444",
        signature,
      }),
    ).toBe(false);
    expect(
      verifyFeedSignature({
        secret: "different-secret",
        userId: USER,
        version: 3,
        viewId: VIEW,
        signature,
      }),
    ).toBe(false);
  });

  it("rejects malformed or missing signatures", () => {
    for (const signature of ["", "short", "!".repeat(43), null, undefined]) {
      expect(
        verifyFeedSignature({ secret: SECRET, userId: USER, version: 0, viewId: VIEW, signature }),
      ).toBe(false);
    }
  });
});

describe("parseFeedVersion", () => {
  it("accepts bounded non-negative integers", () => {
    expect(parseFeedVersion("0")).toBe(0);
    expect(parseFeedVersion("12")).toBe(12);
  });

  it("rejects leading zeroes, negatives, junk and oversized values", () => {
    for (const raw of ["", "-1", "01", "1.5", "abc", "1234567890", null, undefined]) {
      expect(parseFeedVersion(raw)).toBeNull();
    }
  });
});

describe("signFeedUrl", () => {
  it("builds an absolute URL with the expected params", () => {
    const url = new URL(
      signFeedUrl({
        origin: "https://app.example.com/",
        userId: USER,
        version: 2,
        viewId: VIEW,
        signatureSecret: SECRET,
      }) ?? "",
    );
    expect(url.origin + url.pathname).toBe("https://app.example.com/api/widget/v1/calendar.ics");
    expect(url.searchParams.get("u")).toBe(USER);
    expect(url.searchParams.get("v")).toBe("2");
    expect(url.searchParams.get("view")).toBe(VIEW);
    expect(url.searchParams.get("sig")).toBe(feedSignature(SECRET, USER, 2, VIEW));
  });

  it("refuses non-UUID ids and invalid versions", () => {
    const base = {
      origin: "https://app.example.com",
      userId: USER,
      version: 0,
      viewId: VIEW,
      signatureSecret: SECRET,
    };
    expect(signFeedUrl({ ...base, userId: "admin" })).toBeNull();
    expect(signFeedUrl({ ...base, viewId: "default" })).toBeNull();
    expect(signFeedUrl({ ...base, version: -1 })).toBeNull();
    expect(signFeedUrl({ ...base, version: 1.5 })).toBeNull();
  });
});
