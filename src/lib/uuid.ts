const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when the value is a valid UUID. Used to guard `users` lookups: ids
 * that are not UUIDs (e.g. the virtual `"admin"` session id) can never match
 * a `users.id` row and must be filtered out before querying the uuid column.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Drop non-UUID entries from an id list before querying a uuid column. */
export function onlyUuidIds(ids: string[]): string[] {
  return ids.filter(isUuid);
}
