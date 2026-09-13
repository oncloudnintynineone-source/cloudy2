import { cache } from "react";

import { db } from "@/db";
import { eventTitleTemplates, settings } from "@/db/schema";
import {
  BANNER_DEFAULT_COLOR,
  isBannerColor,
  type BannerConfig,
} from "@/lib/banner/banner";
import { AUDIT_RETENTION_DEFAULT } from "@/lib/settings/validate";
import {
  KAH_EMAIL_BODY_TEMPLATE_DEFAULT,
  KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
} from "@/lib/kah/emailDefaults";
import {
  PARADE_EMAIL_BODY_TEMPLATE_DEFAULT,
  PARADE_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
} from "@/lib/parade-email/emailDefaults";
import { sanitizeTitleRecipe, type TitleRecipe } from "@/lib/settings/titleRecipe";
import {
  normalizeAssignments,
  type EventTitleAssignmentTarget,
} from "@/lib/settings/validate";

export interface EventTitleTemplateView {
  id: string;
  label: string;
  recipe: TitleRecipe;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettingsView {
  userKeyword: string;
  nameTemplate: string;
  /** The structured master event-title recipe. */
  eventTitleRecipe: TitleRecipe;
  /** Per-target library assignment: target -> templateId (empty string means use master). */
  eventTitleTemplateAssignments: Partial<Record<EventTitleAssignmentTarget, string>>;
  auditLogRetentionDays: number;
  bannerEnabled: boolean;
  bannerText: string;
  /** Stored curated-color key; null = unset (renders as the default). */
  bannerColor: string | null;
  /**
   * Default required in-country percentage prefilled when a new KAH group
   * is created (the live thresholds live on each group).
   */
  kahDefaultPercentage: number;
  /** Admin-customized KAH breach email templates ({event}/{actor}/{window}/{breaches}). */
  kahEmailSubjectTemplate: string;
  kahEmailBodyTemplate: string;
  /** Daily parade-state email config (Settings → Parade State Email). */
  paradeEmailEnabled: boolean;
  paradeEmailRecipientIds: string[];
  paradeEmailSubjectTemplate: string;
  paradeEmailBodyTemplate: string;
}

/** Coerce a jsonb value to a string array (unknown/blank entries dropped). */
function normalizeIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((id): id is string => typeof id === "string");
}

/**
 * The raw settings row. Cached per request so callers that share a render
 * (the protected layout + a settings page) hit the DB once.
 */
const readSettingsRow = cache(async () => {
  const [row] = await db.select().from(settings).limit(1);
  return row ?? null;
});

/**
 * Read-only view of the settings row. Never exposes the admin password hash,
 * which lives on the same row.
 */
export async function getSettings(): Promise<SettingsView> {
  const row = await readSettingsRow();
  return {
    userKeyword: row?.userKeyword ?? "",
    nameTemplate: row?.nameTemplate ?? "{name}",
    eventTitleRecipe: sanitizeTitleRecipe(
      (row as unknown as { eventTitleRecipe?: unknown })?.eventTitleRecipe,
    ),
    eventTitleTemplateAssignments: normalizeAssignments(
      (row as unknown as { eventTitleTemplateAssignments?: unknown })?.eventTitleTemplateAssignments,
    ),
    auditLogRetentionDays: row?.auditLogRetentionDays ?? AUDIT_RETENTION_DEFAULT,
    bannerEnabled: row?.bannerEnabled ?? false,
    bannerText: row?.bannerText ?? "",
    bannerColor: row?.bannerColor ?? null,
    kahDefaultPercentage: row?.kahPercentage ?? 100,
    kahEmailSubjectTemplate:
      row?.kahEmailSubjectTemplate?.trim() || KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
    kahEmailBodyTemplate: row?.kahEmailBodyTemplate?.trim() || KAH_EMAIL_BODY_TEMPLATE_DEFAULT,
    paradeEmailEnabled: row?.paradeEmailEnabled ?? false,
    paradeEmailRecipientIds: normalizeIdArray(row?.paradeEmailRecipientIds),
    paradeEmailSubjectTemplate:
      row?.paradeEmailSubjectTemplate?.trim() || PARADE_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
    paradeEmailBodyTemplate:
      row?.paradeEmailBodyTemplate?.trim() || PARADE_EMAIL_BODY_TEMPLATE_DEFAULT,
  };
}

export async function listEventTitleTemplates(): Promise<EventTitleTemplateView[]> {
  const rows = await db
    .select()
    .from(eventTitleTemplates)
    .orderBy(eventTitleTemplates.createdAt);
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    recipe: sanitizeTitleRecipe((r as unknown as { recipe?: unknown })?.recipe),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getEventTitleTemplateMap(): Promise<Map<string, EventTitleTemplateView>> {
  const list = await listEventTitleTemplates();
  return new Map(list.map((t) => [t.id, t]));
}

/**
 * The active announcement banner for the app shell, or null when disabled or
 * blank (a disabled banner takes no layout space). The color resolves through
 * the curated list so stale/unknown stored keys fall back to the default.
 */
export async function getBanner(): Promise<BannerConfig | null> {
  const row = await readSettingsRow();
  if (!row?.bannerEnabled || !row.bannerText.trim()) {
    return null;
  }
  return {
    text: row.bannerText.trim(),
    color: isBannerColor(row.bannerColor) ? row.bannerColor : BANNER_DEFAULT_COLOR,
  };
}
