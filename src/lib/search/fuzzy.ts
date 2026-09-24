import Fuse, { type FuseOptionKey, type IFuseOptions } from "fuse.js";

/**
 * Sensible defaults for the app's fuzzy searches:
 * - `threshold: 0.22` — typo tolerance ("alise" → "Alice", one edit) while
 *   excluding short-word false positives ("ling" → "Ming"). Multi-word queries
 *   are matched as one fuzzy pattern, so far-apart words still fail ("tan wong"
 *   does not hit "Tan Wei Ming"); the field-length norm is left on so
 *   near-exact matches rank above partial ones.
 * - `ignoreLocation` — a match anywhere in the text (a phone number's tail, a
 *   mid-word fragment) scores like a prefix.
 * - `shouldSort: false` keeps each caller's ordering (picker sections, roster
 *   order) unless it opts into relevance ranking.
 */
const DEFAULT_FUZZY_OPTIONS = {
  threshold: 0.22,
  ignoreLocation: true,
  minMatchCharLength: 1,
  includeScore: true,
  shouldSort: false,
} as const;

/**
 * A searchable field. A plain string is fuzzy-matched; `{ value, fuzzy: false }`
 * is matched with a case-insensitive substring test instead — for identifiers
 * like phone numbers, where fuzzy matching cross-matches similar values.
 */
export interface FuzzyField {
  value: string | null | undefined;
  fuzzy?: boolean;
}

export type FuzzyFields = readonly (string | null | undefined | FuzzyField)[];

/** A synthetic record used internally by {@link fuzzyFilter}/ {@link fuzzyMatches}. */
interface FieldRecord {
  index: number;
  fields: string[];
}

function normalizeQuery(query: string): string {
  return query.trim();
}

function splitFields(fields: FuzzyFields): { fuzzy: string[]; substring: string[] } {
  const fuzzy: string[] = [];
  const substring: string[] = [];
  for (const field of fields) {
    if (field === null || field === undefined) {
      continue;
    }
    const isObject = typeof field === "object";
    const value = isObject ? field.value : field;
    if (typeof value !== "string" || value.trim() === "") {
      continue;
    }
    // Plain strings and `fuzzy: true` objects are fuzzy; `fuzzy: false` is substring.
    if (!isObject || field.fuzzy !== false) {
      fuzzy.push(value);
    } else {
      substring.push(value.toLowerCase());
    }
  }
  return { fuzzy, substring };
}

function substringMatches(substringFields: string[], qLower: string): boolean {
  return substringFields.some((field) => field.includes(qLower));
}

/**
 * Fuzzy-filter `items` by the fields returned from `getFields`. A blank query
 * returns a shallow copy (no matching). An item matches when every query word
 * fuzzy-matches its text fields OR the raw query is a substring of one of its
 * substring fields. Original order is preserved.
 *
 * Prefer this over {@link fuzzyMatches} inside loops: the index is built once.
 */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => FuzzyFields,
  options?: IFuseOptions<FieldRecord>,
): T[] {
  const q = normalizeQuery(query);
  if (q === "") {
    return [...items];
  }
  const fieldsByIndex = items.map((item) => splitFields(getFields(item)));
  const records: FieldRecord[] = fieldsByIndex.map((fields, index) => ({
    index,
    fields: fields.fuzzy,
  }));
  const fuse = new Fuse(records, {
    keys: ["fields"],
    ...DEFAULT_FUZZY_OPTIONS,
    ...options,
  });
  const fuzzyMatch = new Set(fuse.search(q).map((result) => result.item.index));
  const qLower = q.toLowerCase();
  return items.filter(
    (_item, index) =>
      fuzzyMatch.has(index) || substringMatches(fieldsByIndex[index].substring, qLower),
  );
}

/**
 * Fuzzy-search `items` by one or more Fuse keys, returning matches in relevance
 * order (`shouldSort: true` by default). A blank query returns a shallow copy.
 */
export function fuzzySearch<T>(
  items: readonly T[],
  query: string,
  keys: Array<FuseOptionKey<T>>,
  options?: IFuseOptions<T>,
): T[] {
  const q = normalizeQuery(query);
  if (q === "") {
    return [...items];
  }
  const fuse = new Fuse(items as T[], {
    keys,
    ...DEFAULT_FUZZY_OPTIONS,
    shouldSort: true,
    ...options,
  });
  return fuse.search(q).map((result) => result.item);
}

/**
 * Fuzzy-test a single field set (e.g. one row's name/shortname/phone) against a
 * query. A blank query matches everything. Prefer {@link fuzzyFilter} in loops.
 */
export function fuzzyMatches(
  fields: FuzzyFields,
  query: string,
  options?: IFuseOptions<FieldRecord>,
): boolean {
  const q = normalizeQuery(query);
  if (q === "") {
    return true;
  }
  const { fuzzy, substring } = splitFields(fields);
  if (substringMatches(substring, q.toLowerCase())) {
    return true;
  }
  const record: FieldRecord = { index: 0, fields: fuzzy };
  const fuse = new Fuse([record], {
    keys: ["fields"],
    ...DEFAULT_FUZZY_OPTIONS,
    ...options,
  });
  return fuse.search(q).length > 0;
}
