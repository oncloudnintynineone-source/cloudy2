/**
 * Pure validation/normalization helpers for the settings screen. Kept free of
 * I/O so they can be unit-tested without a database.
 */

export const KEYWORD_MAX_LENGTH = 12;

export interface KeywordFormValues {
  keyword: string;
}

export interface KeywordFormErrors {
  keyword?: string;
  [key: string]: string | undefined;
}

/**
 * Trim and lowercase the keyword, returning it only when it is 1–12 letters.
 * Lowercasing matters because login parsing matches the suffix case-sensitively.
 */
export function normalizeKeyword(raw: string): string | null {
  const keyword = raw.trim().toLowerCase();
  if (!/^[a-z]{1,12}$/.test(keyword)) {
    return null;
  }
  return keyword;
}

export function validateKeywordForm(values: KeywordFormValues): KeywordFormErrors {
  const errors: KeywordFormErrors = {};
  const keyword = values.keyword.trim();

  if (!keyword) {
    errors.keyword = "Keyword is required";
  } else if (!/^[a-z]+$/i.test(keyword)) {
    errors.keyword = "Keyword must contain letters only";
  } else if (keyword.length > KEYWORD_MAX_LENGTH) {
    errors.keyword = `Keyword must be ${KEYWORD_MAX_LENGTH} characters or fewer`;
  }

  return errors;
}
