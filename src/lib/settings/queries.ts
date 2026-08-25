import { cache } from "react";

import { db } from "@/db";
import { settings } from "@/db/schema";
import {
  BANNER_DEFAULT_COLOR,
  isBannerColor,
  normalizeBannerHeight,
  type BannerConfig,
} from "@/lib/banner/banner";
import { AUDIT_RETENTION_DEFAULT } from "@/lib/settings/validate";

export interface SettingsView {
  userKeyword: string;
  nameTemplate: string;
  eventTitleTemplate: string;
  auditLogRetentionDays: number;
  bannerEnabled: boolean;
  bannerText: string;
  /** Stored curated-color key; null = unset (renders as the default). */
  bannerColor: string | null;
  /** Stored curated height preset (px). */
  bannerHeight: number;
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
    eventTitleTemplate: row?.eventTitleTemplate ?? "{description}",
    auditLogRetentionDays: row?.auditLogRetentionDays ?? AUDIT_RETENTION_DEFAULT,
    bannerEnabled: row?.bannerEnabled ?? false,
    bannerText: row?.bannerText ?? "",
    bannerColor: row?.bannerColor ?? null,
    bannerHeight: normalizeBannerHeight(row?.bannerHeight),
  };
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
    height: normalizeBannerHeight(row.bannerHeight),
  };
}
