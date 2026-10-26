import { describe, expect, it } from "vitest";

import {
  decodeDashboardViewShare,
  encodeDashboardViewShare,
  normalizeSharePayload,
  SHARE_TOKEN_VERSION,
  type DashboardViewSharePayload,
} from "./shareToken";

const SECRET = "test-share-secret";
const OTHER_SECRET = "different-secret";

function payload(overrides: Partial<DashboardViewSharePayload> = {}): DashboardViewSharePayload {
  return {
    v: SHARE_TOKEN_VERSION,
    n: "Ops month",
    k: "month",
    c: ["cal-a", "cal-b"],
    u: ["user-a"],
    t: ["Leave", "Duty"],
    b: "Alex",
    ...overrides,
  };
}

function encoded(overrides?: Partial<DashboardViewSharePayload>): string {
  const result = encodeDashboardViewShare(payload(overrides), SECRET);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.token;
}

describe("dashboard view share token", () => {
  it("round-trips the full view definition", () => {
    const token = encoded();
    expect(decodeDashboardViewShare(token, SECRET)).toEqual(payload());
  });

  it("produces a URL-safe token", () => {
    const token = encoded();
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("rejects a wrong secret", () => {
    expect(decodeDashboardViewShare(encoded(), OTHER_SECRET)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = encoded();
    const [body, signature] = token.split(".");
    const tampered = `${body.slice(0, -1)}${body.endsWith("A") ? "B" : "A"}.${signature}`;
    expect(decodeDashboardViewShare(tampered, SECRET)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = encoded();
    const [body] = token.split(".");
    expect(decodeDashboardViewShare(`${body}.AAAA`, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    for (const raw of ["", "nope", ".", "a.", ".b", "a.b.c", "%%%.%%%"]) {
      expect(decodeDashboardViewShare(raw, SECRET)).toBeNull();
    }
  });

  it("rejects unsupported versions, kinds and filter shapes", () => {
    const good = payload();
    expect(normalizeSharePayload({ ...good, v: 2 })).toBeNull();
    expect(normalizeSharePayload({ ...good, k: "not-a-kind" })).toBeNull();
    expect(normalizeSharePayload({ ...good, c: [1, 2] })).toBeNull();
    expect(normalizeSharePayload({ ...good, u: "nope" })).toBeNull();
    expect(normalizeSharePayload({ ...good, t: ["ok", 7] })).toBeNull();
  });

  it("rejects blank/over-long names and oversized filter lists", () => {
    const good = payload();
    expect(normalizeSharePayload({ ...good, n: "   " })).toBeNull();
    expect(normalizeSharePayload({ ...good, n: "x".repeat(41) })).toBeNull();
    expect(normalizeSharePayload({ ...good, c: Array.from({ length: 501 }, (_, i) => `c${i}`) }))
      .toBeNull();
  });

});
