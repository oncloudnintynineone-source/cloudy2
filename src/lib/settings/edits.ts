/**
 * Pure per-setting edits for the singleton settings row. Each function
 * validates + normalizes one admin input and returns the patch, the audit
 * before/after payload, and the cache/revalidation targets — no I/O.
 * `editSetting` (`write.ts`) owns the ritual (auth, read, update, audit,
 * invalidation, revalidate) and these functions own the per-setting decision,
 * so a settings bug lives in one module instead of eight copies.
 */

import type { settings } from "@/db/schema";
import {
  formatBannerColorLabel,
  normalizeBannerColor,
  validateBannerForm,
  type BannerFormValues,
} from "@/lib/banner/banner";
import { validateKahNotificationsForm, type KahNotificationsFormValues } from "@/lib/kah/validate";
import {
  FEATURE_FLAGS,
  normalizeFeatureFlags,
  validateFeatureFlags,
  type FeatureFlagKey,
} from "@/lib/settings/featureFlags";
import {
  EVENT_TITLE_ASSIGNMENT_TARGETS,
  normalizeAssignments,
  normalizeKeyword,
  normalizeRetentionDays,
  validateAssignments,
  validateNameTemplate,
  validateRetentionForm,
} from "@/lib/settings/validate";
import {
  prepareTitleRecipe,
  sanitizeTitleRecipe,
  type TitleRecipe,
} from "@/lib/settings/titleRecipe";

/** The settings row shape the ritual reads and patches. */
export type SettingsRow = typeof settings.$inferSelect;

/** The config cache keys a settings write may invalidate. */
export type SettingsCacheKey = "settings" | "eventTitleTemplates";

export type SettingsField =
  | "keyword"
  | "nameTemplate"
  | "recipe"
  | "retentionDays"
  | "bannerText"
  | "kahEmails"
  | "kahSubject"
  | "kahBody"
  | "templateLabel"
  | "assignments"
  | "featureFlags";

export type SettingsActionResult =
  { ok: true } | { ok: false; error: string; field?: SettingsField };

/** The side-effect-free plan for one settings-row write. */
export interface PreparedSettingEdit {
  /** The row patch; the ritual adds `updatedAt`. */
  patch: Partial<SettingsRow>;
  auditBefore: Record<string, unknown>;
  auditAfter: Record<string, unknown>;
  /** Config cache keys to invalidate; defaults to `["settings"]`. */
  cacheKeys?: readonly SettingsCacheKey[];
  /** Paths to revalidate. */
  revalidate: readonly string[];
}

export type SettingsEditOutcome =
  { ok: true; prepared: PreparedSettingEdit } | { ok: false; error: string; field?: SettingsField };

export function prepareKeywordEdit(
  before: SettingsRow | undefined,
  keyword: string,
): SettingsEditOutcome {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) {
    return { ok: false, error: "Keyword must be 1–12 letters", field: "keyword" };
  }
  return {
    ok: true,
    prepared: {
      patch: { userKeyword: normalized },
      auditBefore: { userKeyword: before?.userKeyword ?? null },
      auditAfter: { userKeyword: normalized },
      revalidate: ["/settings/security"],
    },
  };
}

export function prepareNameTemplateEdit(
  before: SettingsRow | undefined,
  template: string,
): SettingsEditOutcome {
  const errors = validateNameTemplate({ nameTemplate: template });
  if (errors.nameTemplate) {
    return { ok: false, error: errors.nameTemplate, field: "nameTemplate" };
  }
  const normalized = template.trim();
  return {
    ok: true,
    prepared: {
      patch: { nameTemplate: normalized },
      auditBefore: { nameTemplate: before?.nameTemplate ?? null },
      auditAfter: { nameTemplate: normalized },
      revalidate: ["/settings/templates"],
    },
  };
}

export function prepareEventTitleRecipeEdit(
  before: SettingsRow | undefined,
  recipe: TitleRecipe,
): SettingsEditOutcome {
  const prepared = prepareTitleRecipe(recipe);
  if ("error" in prepared) {
    return { ok: false, error: prepared.error, field: "recipe" };
  }
  const normalized = prepared.recipe;
  return {
    ok: true,
    prepared: {
      patch: { eventTitleRecipe: normalized },
      auditBefore: { eventTitleRecipe: sanitizeTitleRecipe(before?.eventTitleRecipe) },
      auditAfter: { eventTitleRecipe: normalized },
      revalidate: ["/settings/templates", "/dashboard"],
    },
  };
}

export function prepareAssignmentsEdit(
  before: SettingsRow | undefined,
  assignments: Record<string, string | null>,
  knownTemplateIds: ReadonlySet<string>,
): SettingsEditOutcome {
  // Allow null/empty to mean master fallback; only known targets are stored.
  const cleaned: Record<string, string> = {};
  for (const target of EVENT_TITLE_ASSIGNMENT_TARGETS) {
    const tid = assignments[target];
    if (tid == null || tid === "") continue;
    cleaned[target] = tid.trim();
  }
  const errors = validateAssignments(cleaned, knownTemplateIds);
  if (Object.keys(errors).length > 0) {
    const first = Object.entries(errors)[0];
    return { ok: false, error: first[1], field: "assignments" };
  }
  return {
    ok: true,
    prepared: {
      patch: { eventTitleTemplateAssignments: cleaned },
      auditBefore: {
        assignments: normalizeAssignments(before?.eventTitleTemplateAssignments),
      },
      auditAfter: { assignments: cleaned },
      revalidate: ["/settings/templates", "/dashboard"],
    },
  };
}

export function prepareRetentionEdit(
  before: SettingsRow | undefined,
  days: number,
): SettingsEditOutcome {
  const errors = validateRetentionForm({ retentionDays: days });
  if (errors.retentionDays) {
    return { ok: false, error: errors.retentionDays, field: "retentionDays" };
  }
  const retentionDays = normalizeRetentionDays(days);
  return {
    ok: true,
    prepared: {
      patch: { auditLogRetentionDays: retentionDays },
      auditBefore: { auditLogRetentionDays: before?.auditLogRetentionDays ?? null },
      auditAfter: { auditLogRetentionDays: retentionDays },
      revalidate: ["/settings/general"],
    },
  };
}

export function prepareBannerEdit(
  before: SettingsRow | undefined,
  values: BannerFormValues,
): SettingsEditOutcome {
  const errors = validateBannerForm(values);
  if (errors.text) {
    return { ok: false, error: errors.text, field: "bannerText" };
  }
  const enabled = values.enabled === true;
  const text = values.text.trim();
  const color = normalizeBannerColor(values.color);
  return {
    ok: true,
    prepared: {
      patch: { bannerEnabled: enabled, bannerText: text, bannerColor: color },
      auditBefore: {
        bannerEnabled: before?.bannerEnabled ?? false,
        bannerText: before?.bannerText ?? "",
        bannerColor: formatBannerColorLabel(before?.bannerColor),
      },
      auditAfter: {
        bannerEnabled: enabled,
        bannerText: text,
        bannerColor: formatBannerColorLabel(color),
      },
      revalidate: ["/settings/banner"],
    },
  };
}

export function prepareFeatureFlagsEdit(
  before: SettingsRow | undefined,
  values: Partial<Record<FeatureFlagKey, string>>,
): SettingsEditOutcome {
  // Only the flags the caller submits are written; an empty payload is an error.
  const submitted: Record<string, string> = {};
  for (const def of FEATURE_FLAGS) {
    const value = values[def.key as FeatureFlagKey];
    if (value === undefined) continue;
    submitted[def.key] = value;
  }
  if (Object.keys(submitted).length === 0) {
    return { ok: false, error: "No feature flags to update", field: "featureFlags" };
  }

  // Route through the registry validator; the before-values are already valid,
  // so only a submitted value can fail. Keep the labeled message the form expects.
  const beforeFlags = normalizeFeatureFlags(before ?? {});
  const errors = validateFeatureFlags({ ...beforeFlags, ...submitted } as Record<
    FeatureFlagKey,
    string
  >);
  const firstError = FEATURE_FLAGS.find((def) => errors[def.key]);
  if (firstError) {
    return {
      ok: false,
      error: `${firstError.label}: choose one of the available options`,
      field: "featureFlags",
    };
  }

  const patch: Partial<SettingsRow> = {};
  for (const [key, value] of Object.entries(submitted)) {
    (patch as Record<string, unknown>)[key] = value;
  }
  return {
    ok: true,
    prepared: {
      patch,
      auditBefore: beforeFlags,
      auditAfter: { ...beforeFlags, ...submitted },
      revalidate: ["/settings/feature-flags"],
    },
  };
}

export function prepareKahNotificationsEdit(
  before: SettingsRow | undefined,
  values: KahNotificationsFormValues,
): SettingsEditOutcome {
  const errors = validateKahNotificationsForm(values);
  if (errors.subjectTemplate || errors.bodyTemplate) {
    return {
      ok: false,
      error: errors.subjectTemplate ?? errors.bodyTemplate!,
      field: errors.subjectTemplate ? "kahSubject" : "kahBody",
    };
  }
  const subject = values.subjectTemplate.trim();
  const body = values.bodyTemplate.trim();
  return {
    ok: true,
    prepared: {
      patch: { kahEmailSubjectTemplate: subject, kahEmailBodyTemplate: body },
      auditBefore: {
        kahEmailSubjectTemplate: before?.kahEmailSubjectTemplate ?? null,
        kahEmailBodyTemplate: before?.kahEmailBodyTemplate ?? null,
      },
      auditAfter: { kahEmailSubjectTemplate: subject, kahEmailBodyTemplate: body },
      revalidate: ["/settings/general", "/settings/kah-groups"],
    },
  };
}
