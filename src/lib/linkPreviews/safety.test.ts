import { describe, expect, it } from "vitest";

import { isSafeHost, isSafePreviewUrl } from "./safety";

describe("isSafePreviewUrl", () => {
  it("accepts public http(s) URLs, ports included", () => {
    expect(isSafePreviewUrl("https://example.com/page")).toBe(true);
    expect(isSafePreviewUrl("http://example.com:8080/x")).toBe(true);
    expect(isSafePreviewUrl("https://8.8.8.8/x")).toBe(true);
  });

  it("rejects non-http(s) schemes and garbage", () => {
    expect(isSafePreviewUrl("ftp://example.com")).toBe(false);
    expect(isSafePreviewUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePreviewUrl("file:///etc/passwd")).toBe(false);
    expect(isSafePreviewUrl("not a url")).toBe(false);
  });

  it("rejects names that never resolve publicly", () => {
    expect(isSafePreviewUrl("http://localhost/x")).toBe(false);
    expect(isSafePreviewUrl("http://app.localhost/x")).toBe(false);
    expect(isSafePreviewUrl("http://printer.local/x")).toBe(false);
    expect(isSafePreviewUrl("http://db.internal/x")).toBe(false);
    expect(isSafePreviewUrl("http://hidden.onion/x")).toBe(false);
  });
});

describe("isSafeHost — IPv4", () => {
  const blocked = [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "224.0.0.1",
    "255.255.255.255",
  ];
  it.each(blocked)("blocks %s", (host) => {
    expect(isSafeHost(host)).toBe(false);
  });

  const allowed = ["8.8.8.8", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1"];
  it.each(allowed)("allows %s", (host) => {
    expect(isSafeHost(host)).toBe(true);
  });

  it("blocks octal-padded octets", () => {
    expect(isSafeHost("010.1.1.1")).toBe(false);
    expect(isSafeHost("127.0.0.01")).toBe(false);
  });
});

describe("isSafeHost — IPv6", () => {
  const blocked = [
    "::",
    "::1",
    "fe80::1",
    "febf:cafe::1",
    "fc00::1",
    "fd12:3456::78",
    "::ffff:10.0.0.1",
    "::192.168.0.1",
  ];
  it.each(blocked)("blocks %s", (host) => {
    expect(isSafeHost(host)).toBe(false);
  });

  it("allows public v6 addresses", () => {
    expect(isSafeHost("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
  });

  it("accepts bracketed hosts from URL parsing", () => {
    expect(isSafePreviewUrl("http://[::1]/x")).toBe(false);
    expect(isSafePreviewUrl("http://[fe80::dead:beef]/x")).toBe(false);
    expect(isSafePreviewUrl("http://[2606::1]/x")).toBe(true);
  });
});

describe("isSafeHost — case and shape", () => {
  it("is case-insensitive", () => {
    expect(isSafeHost("LOCALHOST")).toBe(false);
    expect(isSafeHost("Intranet.LOCAL")).toBe(false);
  });

  it("rejects an empty host", () => {
    expect(isSafeHost("")).toBe(false);
  });
});
