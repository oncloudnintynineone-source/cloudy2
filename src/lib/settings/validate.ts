/**
 * Pure validation/normalization helpers for the settings screen. Kept free of
 * I/O so they can be unit-tested without a database.
 */

export const KEYWORD_MAX_LENGTH = 12;
export const NAME_TEMPLATE_MAX_LENGTH = 200;
export const EVENT_TITLE_TEMPLATES_MAX_COUNT = 20;
export const AUDIT_RETENTION_MIN = 7;
export const AUDIT_RETENTION_MAX = 365;
export const AUDIT_RETENTION_DEFAULT = 90;

export const NAME_TEMPLATE_PLACEHOLDERS = ["{name}", "{department}"] as const;

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

export const DASHBOARD_VIEW_VALUES = ["month", "week", "weekv2", "schedule", "agenda"] as const;
export type DashboardViewValue = (typeof DASHBOARD_VIEW_VALUES)[number];

/**
 * Every target a template can be assigned to: the dashboard views, the Pinned
 * Events panel (`pinned`), the header's pinned-events ticker (`pinnedHeader`),
 * and the two push-notification bodies (`notifyCreated` / `notifyAdded`).
 * "Empty = default" applies to all of them (notification targets fall back to
 * their built-in copy, not Master).
 */
export const EVENT_TITLE_ASSIGNMENT_TARGETS = [
  ...DASHBOARD_VIEW_VALUES,
  "pinned",
  "pinnedHeader",
  "notifyCreated",
  "notifyAdded",
] as const;
export type EventTitleAssignmentTarget = (typeof EVENT_TITLE_ASSIGNMENT_TARGETS)[number];

export const EVENT_TITLE_TARGET_LABELS: Record<EventTitleAssignmentTarget, string> = {
  month: "Month",
  week: "Week (H)",
  weekv2: "Week (D)",
  schedule: "Day",
  agenda: "Agenda",
  pinned: "Pinned events (panel)",
  pinnedHeader: "Pinned events (header)",
  notifyCreated: "Notification — new event",
  notifyAdded: "Notification — added to event",
};

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

export function normalizeAssignments(
  raw: unknown,
): Partial<Record<EventTitleAssignmentTarget, string>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<EventTitleAssignmentTarget, string>> = {};
  for (const target of EVENT_TITLE_ASSIGNMENT_TARGETS) {
    const val = (raw as Record<string, unknown>)[target];
    if (typeof val === "string" && val.trim()) {
      out[target] = val.trim();
    }
  }
  return out;
}

export function validateAssignments(
  assignments: Record<string, string | null | undefined>,
  knownIds: Set<string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const target of EVENT_TITLE_ASSIGNMENT_TARGETS) {
    const id = assignments[target];
    if (id == null || id === "") continue;
    if (!knownIds.has(id)) {
      errors[target] = "Unknown template";
    }
  }
  return errors;
}
