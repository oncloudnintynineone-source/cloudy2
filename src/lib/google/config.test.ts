import { describe, expect, it } from "vitest";

import { getServiceAccountConfig, hasGoogleCredentials } from "./config";

describe("getServiceAccountConfig", () => {
  it("parses a base64-encoded service account JSON key", () => {
    const payload = {
      type: "service_account",
      client_email: "cloudy@project.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n",
    };
    const env = {
      GOOGLE_SERVICE_ACCOUNT_BASE64: Buffer.from(JSON.stringify(payload)).toString("base64"),
    };
    expect(getServiceAccountConfig(env)).toEqual({
      clientEmail: payload.client_email,
      privateKey: payload.private_key.trim(),
    });
  });

  it("prefers the base64 key over the individual fields", () => {
    const env = {
      GOOGLE_SERVICE_ACCOUNT_BASE64: Buffer.from(
        JSON.stringify({ client_email: "a@b.c", private_key: "key-a" }),
      ).toString("base64"),
      GOOGLE_CLIENT_EMAIL: "b@b.c",
      GOOGLE_PRIVATE_KEY: "key-b",
    };
    const config = getServiceAccountConfig(env);
    expect(config?.clientEmail).toBe("a@b.c");
  });

  it("falls back to individual fields and unescapes newlines", () => {
    const env = {
      GOOGLE_CLIENT_EMAIL: "cloudy@project.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----\\n",
    };
    expect(getServiceAccountConfig(env)).toEqual({
      clientEmail: "cloudy@project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n",
    });
  });

  it("returns null for malformed base64 and missing individual fields", () => {
    expect(getServiceAccountConfig({ GOOGLE_SERVICE_ACCOUNT_BASE64: "not-base64-json" })).toBeNull();
  });

  it("returns null when nothing is configured", () => {
    expect(getServiceAccountConfig({})).toBeNull();
  });

  it("returns null when only one of email/key is set", () => {
    expect(getServiceAccountConfig({ GOOGLE_CLIENT_EMAIL: "a@b.c" })).toBeNull();
    expect(getServiceAccountConfig({ GOOGLE_PRIVATE_KEY: "key" })).toBeNull();
  });
});

describe("hasGoogleCredentials", () => {
  it("is true when credentials are present", () => {
    expect(hasGoogleCredentials({ GOOGLE_CLIENT_EMAIL: "a@b.c", GOOGLE_PRIVATE_KEY: "key" })).toBe(
      true,
    );
  });

  it("is false when credentials are absent", () => {
    expect(hasGoogleCredentials({})).toBe(false);
  });
});
