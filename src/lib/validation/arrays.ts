/**
 * Pure JSONB string-array normalization shared by the preference/view/settings
 * readers. Kept free of I/O so it unit-tests without a database.
 */

export interface StringArrayOptions {
  /**
   * Keep empty strings. Defaults to false — remembered filter id lists drop
   * blanks, while a few stored settings columns keep them verbatim.
   */
  keepEmpty?: boolean;
}

/**
 * A stored JSONB value as a string array. `null` means "not an array" so
 * callers can distinguish absent/garbage from an explicit empty selection;
 * an empty input array is preserved as `[]`.
 */
export function normalizeStringArray(
  raw: unknown,
  options: StringArrayOptions = {},
): string[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const keepEmpty = options.keepEmpty === true;
  return raw.filter(
    (entry): entry is string => typeof entry === "string" && (keepEmpty || entry.length > 0),
  );
}
