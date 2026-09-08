import { describe, expect, it } from "vitest";

import { parseVapidConfig, vapidPublicKey } from "./vapid";

describe("vapidPublicKey", () => {
  it("returns the trimmed public key when present", () => {
    expect(vapidPublicKey({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "  abc.def  " })).toBe("abc.def");
  });

  it("returns null when unset or blank", () => {
    expect(vapidPublicKey({})).toBeNull();
    expect(vapidPublicKey({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "   " })).toBeNull();
    expect(vapidPublicKey({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined })).toBeNull();
  });
});

describe("parseVapidConfig", () => {
  const base = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-key",
    VAPID_PRIVATE_KEY: "private-key",
    VAPID_SUBJECT: "mailto:cloudy2@example.com",
  };

  it("returns the config when all three vars are present", () => {
    expect(parseVapidConfig(base)).toEqual({
      subject: "mailto:cloudy2@example.com",
      publicKey: "public-key",
      privateKey: "private-key",
    });
  });

  it("trims whitespace around the values", () => {
    expect(
      parseVapidConfig({
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: " public ",
        VAPID_PRIVATE_KEY: " private ",
        VAPID_SUBJECT: " mailto:a@b ",
      }),
    ).toEqual({
      subject: "mailto:a@b",
      publicKey: "public",
      privateKey: "private",
    });
  });

  it.each([
    ["public key missing", { ...base, NEXT_PUBLIC_VAPID_PUBLIC_KEY: "" }],
    ["private key missing", { ...base, VAPID_PRIVATE_KEY: undefined }],
    ["subject missing", { ...base, VAPID_SUBJECT: "  " }],
  ])("returns null when the %s", (_label, env) => {
    expect(parseVapidConfig(env)).toBeNull();
  });

  it("defaults to process.env", () => {
    // No crash when called with no argument in a bare node env.
    expect(() => parseVapidConfig()).not.toThrow();
  });
});
