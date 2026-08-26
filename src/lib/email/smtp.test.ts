import { describe, expect, it } from "vitest";

import { parseSmtpConfig } from "./smtp";

describe("parseSmtpConfig", () => {
  it("parses host, port, credentials and TLS from a valid URL", () => {
    expect(
      parseSmtpConfig({
        SMTP_URL: "smtp://ops%40gmail.com:apppass@smtp.gmail.com:587",
      }),
    ).toEqual({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: "ops@gmail.com",
      pass: "apppass",
    });
    expect(parseSmtpConfig({ SMTP_URL: "smtps://u:p@mail.example.com" })).toEqual({
      host: "mail.example.com",
      port: 465,
      secure: true,
      user: "u",
      pass: "p",
    });
    // Port 465 implies implicit TLS even on the plain scheme.
    expect(parseSmtpConfig({ SMTP_URL: "smtp://u:p@h:465" })?.secure).toBe(true);
  });

  it("returns null for missing or malformed values", () => {
    expect(parseSmtpConfig({})).toBeNull();
    expect(parseSmtpConfig({ SMTP_URL: "" })).toBeNull();
    expect(parseSmtpConfig({ SMTP_URL: "not-a-url" })).toBeNull();
    expect(parseSmtpConfig({ SMTP_URL: "https://u:p@h.com" })).toBeNull();
    expect(parseSmtpConfig({ SMTP_URL: "smtp://smtp.gmail.com:587" })).toBeNull(); // no userinfo
    expect(parseSmtpConfig({ SMTP_URL: "smtp://u:p@:587" })).toBeNull(); // no host
    expect(parseSmtpConfig({ SMTP_URL: "smtp://u:p@h:notaport" })).toBeNull();
    expect(parseSmtpConfig({ SMTP_URL: "smtp://u:p@h:99999" })).toBeNull();
  });
});
