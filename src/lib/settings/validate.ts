/**
 * Pure validation/normalization helpers for the settings screen. Kept free of
 * I/O so they can be unit-tested without a database.
 */

export const KEYWORD_MAX_LENGTH = 12;
export const NAME_TEMPLATE_MAX_LENGTH = 200;
export const EVENT_TITLE_TEMPLATE_MAX_LENGTH = 300;
export const AUDIT_RETENTION_MIN = 7;
export const AUDIT_RETENTION_MAX = 365;
export const AUDIT_RETENTION_DEFAULT = 90;

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
  "{location}",
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

export interface RetentionFormValues {
  retentionDays: number;
}

export interface RetentionFormErrors {
  retentionDays?: string;
  [key: string]: string | undefined;
}

/**
 * Coerce a retention value to a whole number of days, clamped to
 * `AUDIT_RETENTION_MIN`..`AUDIT_RETENTION_MAX`. Non-finite input falls back to
 * the default. Used by the General tab and the audit page purge helper.
 */
export function normalizeRetentionDays(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return AUDIT_RETENTION_DEFAULT;
  }
  const days = Math.round(numeric);
  if (days < AUDIT_RETENTION_MIN) {
    return AUDIT_RETENTION_MIN;
  }
  if (days > AUDIT_RETENTION_MAX) {
    return AUDIT_RETENTION_MAX;
  }
  return days;
}

export function validateRetentionForm(values: RetentionFormValues): RetentionFormErrors {
  const errors: RetentionFormErrors = {};

  if (!Number.isFinite(values.retentionDays)) {
    errors.retentionDays = "Retention must be a number of days";
  } else if (values.retentionDays < AUDIT_RETENTION_MIN) {
    errors.retentionDays = `Retention must be at least ${AUDIT_RETENTION_MIN} days`;
  } else if (values.retentionDays > AUDIT_RETENTION_MAX) {
    errors.retentionDays = `Retention must be at most ${AUDIT_RETENTION_MAX} days`;
  }

  return errors;
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
  } else if (/\r|\n/.test(values.nameTemplate)) {
    errors.nameTemplate = "Template must be a single line";
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
  } else if (/\r|\n/.test(values.eventTitleTemplate)) {
    errors.eventTitleTemplate = "Template must be a single line";
  } else if (template.length > EVENT_TITLE_TEMPLATE_MAX_LENGTH) {
    errors.eventTitleTemplate = `Event title template must be ${EVENT_TITLE_TEMPLATE_MAX_LENGTH} characters or fewer`;
  }

  return errors;
}

/**
 * Non-blocking warnings for the event title template. Unmatched `<`/`>` are
 * rendered fail-soft as literal text, but the admin should be warned so they
 * can fix the grouping or escape with `\<`/`\>`.
 */
export function getEventTitleTemplateWarnings(template: string): string[] {
  const warnings: string[] = [];
  let depth = 0;
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === "\\" && i + 1 < template.length) {
      const next = template[i + 1];
      if (next === "<" || next === ">" || next === "{" || next === "}" || next === "\\") {
        i += 2;
        continue;
      }
    }
    if (ch === "<") {
      depth += 1;
    } else if (ch === ">") {
      if (depth > 0) {
        depth -= 1;
      } else {
        warnings.push("Unmatched '>' — escape as \\> for a literal '>'");
        break;
      }
    }
    i += 1;
  }
  if (depth > 0) {
    warnings.push("Unmatched '<' — escape as \\< for a literal '<' or close with '>'");
  }
  return warnings;
}
