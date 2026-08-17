/**
 * Pure validation/normalization helpers for the settings screen. Kept free of
 * I/O so they can be unit-tested without a database.
 */

export const KEYWORD_MAX_LENGTH = 12;
export const NAME_TEMPLATE_MAX_LENGTH = 200;
export const EVENT_TITLE_TEMPLATE_MAX_LENGTH = 200;

export const NAME_TEMPLATE_PLACEHOLDERS = ["{name}", "{department}"] as const;

export const EVENT_TITLE_PLACEHOLDERS = [
  "{description}",
  "{type}",
  "{type:acronym}",
  "{people}",
  "{people:full}",
  "{people:acronym}",
  "{people:fqn}",
  "{departments}",
] as const;

export interface KeywordFormValues {
  keyword: string;
}

export interface NameTemplateFormValues {
  nameTemplate: string;
}

export interface NameTemplateFormErrors {
  nameTemplate?: string;
  [key: string]: string | undefined;
}

export interface EventTitleTemplateFormValues {
  eventTitleTemplate: string;
}

export interface EventTitleTemplateFormErrors {
  eventTitleTemplate?: string;
  [key: string]: string | undefined;
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

export function validateNameTemplate(values: NameTemplateFormValues): NameTemplateFormErrors {
  const errors: NameTemplateFormErrors = {};
  const template = values.nameTemplate.trim();

  if (!template) {
    errors.nameTemplate = "Name template is required";
  } else if (template.length > NAME_TEMPLATE_MAX_LENGTH) {
    errors.nameTemplate = `Name template must be ${NAME_TEMPLATE_MAX_LENGTH} characters or fewer`;
  }

  return errors;
}

export function validateEventTitleTemplate(
  values: EventTitleTemplateFormValues,
): EventTitleTemplateFormErrors {
  const errors: EventTitleTemplateFormErrors = {};
  const template = values.eventTitleTemplate.trim();

  if (!template) {
    errors.eventTitleTemplate = "Event title template is required";
  } else if (template.length > EVENT_TITLE_TEMPLATE_MAX_LENGTH) {
    errors.eventTitleTemplate = `Event title template must be ${EVENT_TITLE_TEMPLATE_MAX_LENGTH} characters or fewer`;
  }

  return errors;
}
