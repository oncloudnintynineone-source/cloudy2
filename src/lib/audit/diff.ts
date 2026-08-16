/**
 * Pure helpers that build the `details` payload of an audit log row. Kept free
 * of I/O so they can be unit-tested without a database.
 */

export interface FieldDiff {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changes: Record<string, [unknown, unknown]>;
}

/**
 * Compares two records and returns the changed fields as `[before, after]`
 * pairs. Fields that are equal (or absent on both sides) are omitted.
 * Records are compared by `JSON.stringify` so nested values are handled too.
 */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): FieldDiff {
  const changes: Record<string, [unknown, unknown]> = {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const beforeValue = before[key];
    const afterValue = after[key];
    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
      continue;
    }
    changes[key] = [beforeValue, afterValue];
  }

  return { before, after, changes };
}
