/**
 * Pure error-shape helpers for errors thrown by the Drizzle + postgres-js
 * stack. Kept free of imports and I/O so they can be unit-tested without a
 * database.
 *
 * drizzle-orm wraps every failed query in a `DrizzleQueryError`
 * (`"Failed query: <sql>\nparams: ..."`) and hides the underlying postgres-js
 * `PostgresError` — the one carrying the SQLSTATE `code` and `constraint_name`
 * — in `.cause`. Inspecting a caught error therefore requires walking the
 * `.cause` chain.
 */

/** SQLSTATE code for a unique-constraint violation. */
const UNIQUE_VIOLATION_CODE = "23505";

/** Prefix of a drizzle-orm `DrizzleQueryError` message (raw SQL inside). */
const DRIZZLE_QUERY_ERROR_PREFIX = "Failed query: ";

export interface UniqueViolation {
  /** Name of the violated constraint (e.g. `users_phone_idx`), if known. */
  constraintName: string | null;
}

/**
 * Walks `error` and its `.cause` chain (cycle-guarded) and returns the first
 * unique-constraint violation (SQLSTATE 23505) found, or null when the chain
 * holds none.
 */
export function findUniqueViolation(error: unknown): UniqueViolation | null {
  for (const candidate of errorChain(error)) {
    if (candidate.code === UNIQUE_VIOLATION_CODE) {
      return {
        constraintName:
          typeof candidate.constraint_name === "string" ? candidate.constraint_name : null,
      };
    }
  }
  return null;
}

/**
 * True when `error` or anything in its `.cause` chain is a drizzle-orm query
 * error. Such messages contain the raw SQL and must not be shown to users.
 */
export function isDbQueryError(error: unknown): boolean {
  return errorChain(error).some(
    (candidate) =>
      typeof candidate.message === "string" &&
      candidate.message.startsWith(DRIZZLE_QUERY_ERROR_PREFIX),
  );
}

/**
 * User-facing message for a server-side failure: the error's own message for
 * real errors (e.g. Google API failures), or the caller-supplied `fallback`
 * when the message is raw SQL from a failed DB query / not a string.
 */
export function describeError(error: unknown, fallback: string): string {
  if (isDbQueryError(error)) {
    return fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

interface ChainedError {
  message?: string;
  code?: string;
  constraint_name?: string;
  cause?: unknown;
}

/**
 * The error plus every `.cause` down the chain (cycle-guarded, bounded).
 * Non-objects contribute nothing; a string cause ends the chain.
 */
function* errorChain(error: unknown): Generator<ChainedError> {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    yield current as ChainedError;
    current = (current as { cause?: unknown }).cause;
  }
}
