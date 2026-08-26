import { describe, expect, it } from "vitest";

import { describeError, findUniqueViolation, isDbQueryError } from "./pgErrors";

/** postgres-js-style PostgresError (code + constraint_name copied onto it). */
function postgresError(code: string, constraintName?: string): Error {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    code,
    ...(constraintName ? { constraint_name: constraintName } : {}),
  });
}

/** drizzle-orm-style DrizzleQueryError wrapping a cause. */
function drizzleQueryError(cause: unknown): Error {
  const error = new Error('Failed query: update "users" set "phone" = $1 where "users"."id" = $2');
  error.cause = cause;
  return error;
}

describe("findUniqueViolation", () => {
  it("finds a raw PostgresError unique violation", () => {
    expect(findUniqueViolation(postgresError("23505", "users_phone_idx"))).toEqual({
      constraintName: "users_phone_idx",
    });
  });

  it("finds the violation through the DrizzleQueryError wrapper", () => {
    expect(
      findUniqueViolation(drizzleQueryError(postgresError("23505", "users_phone_idx"))),
    ).toEqual({
      constraintName: "users_phone_idx",
    });
  });

  it("finds the violation through multiple cause levels", () => {
    const inner = drizzleQueryError(postgresError("23505", "users_shortname_idx"));
    const outer = new Error("wrapper");
    outer.cause = inner;
    expect(findUniqueViolation(outer)).toEqual({ constraintName: "users_shortname_idx" });
  });

  it("returns null constraintName when the backend did not report one", () => {
    expect(findUniqueViolation(drizzleQueryError(postgresError("23505")))).toEqual({
      constraintName: null,
    });
  });

  it("returns null for other SQLSTATE codes", () => {
    expect(findUniqueViolation(drizzleQueryError(postgresError("23503", "fk")))).toBeNull();
    expect(findUniqueViolation(postgresError("22P02"))).toBeNull();
  });

  it("returns null for errors without a code", () => {
    expect(findUniqueViolation(new Error("boom"))).toBeNull();
    expect(findUniqueViolation(drizzleQueryError(new Error("boom")))).toBeNull();
  });

  it("returns null for non-object values", () => {
    expect(findUniqueViolation(null)).toBeNull();
    expect(findUniqueViolation(undefined)).toBeNull();
    expect(findUniqueViolation("Failed query: select 1")).toBeNull();
  });

  it("terminates on a circular cause chain", () => {
    const a = new Error("a");
    const b = new Error("b");
    (a as { cause?: unknown }).cause = b;
    (b as { cause?: unknown }).cause = a;
    expect(findUniqueViolation(a)).toBeNull();
  });
});

describe("isDbQueryError", () => {
  it("detects the drizzle wrapper and wrappers around it", () => {
    const wrapped = drizzleQueryError(postgresError("23505"));
    const outer = new Error("wrapper");
    outer.cause = wrapped;
    expect(isDbQueryError(wrapped)).toBe(true);
    expect(isDbQueryError(outer)).toBe(true);
  });

  it("does not flag real errors", () => {
    expect(isDbQueryError(new Error("Google Calendar API error"))).toBe(false);
    expect(isDbQueryError(postgresError("23505"))).toBe(false);
    expect(isDbQueryError(null)).toBe(false);
  });
});

describe("describeError", () => {
  it("returns the fallback for drizzle-wrapped errors (raw SQL hidden)", () => {
    expect(
      describeError(drizzleQueryError(postgresError("23505")), "Could not save the user"),
    ).toBe("Could not save the user");
  });

  it("keeps the message of real errors", () => {
    expect(describeError(new Error("Google Calendar API error"), "fallback")).toBe(
      "Google Calendar API error",
    );
  });

  it("returns the fallback for non-Error or empty-message values", () => {
    expect(describeError("something", "fallback")).toBe("fallback");
    expect(describeError(new Error(""), "fallback")).toBe("fallback");
    expect(describeError(null, "fallback")).toBe("fallback");
  });
});
