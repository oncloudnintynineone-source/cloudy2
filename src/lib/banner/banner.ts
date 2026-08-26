import type { MantineColor } from "@mantine/core";

/**
 * Pure helpers for the announcement banner (Settings → Banner). Kept free of
 * I/O so they can be unit-tested without a database.
 *
 * The banner is a persistent announcement shown above the app header for all
 * signed-in users. Its config lives on the singleton settings row; disabling
 * it removes it from the layout entirely (no reserved space). The background
 * color is curated by the app — an admin picks from `BANNER_COLORS`, never a
 * raw color code.
 */

export interface BannerColorOption {
  /** Mantine palette name; rendered with its `-filled` CSS variable. */
  key: MantineColor;
  label: string;
  /** "light" = white text on the filled background, "dark" = near-black text. */
  textColor: "light" | "dark";
}

/**
 * The curated banner backgrounds. Entries pair a Mantine palette with its
 * readable text color so no free-form color input is ever needed.
 */
export const BANNER_COLORS: readonly BannerColorOption[] = [
  { key: "brand", label: "Navy", textColor: "light" },
  { key: "accent", label: "Amber", textColor: "dark" },
  { key: "red", label: "Red", textColor: "light" },
  { key: "green", label: "Green", textColor: "light" },
  { key: "orange", label: "Orange", textColor: "light" },
  { key: "violet", label: "Violet", textColor: "light" },
  { key: "cyan", label: "Cyan", textColor: "light" },
];

/** Used when the stored color is unset or not in the curated list. */
export const BANNER_DEFAULT_COLOR: MantineColor = "brand";

export const BANNER_TEXT_MAX_LENGTH = 200;

/**
 * The fixed banner height. The banner uses this as a min-height and grows
 * taller when text wraps. The measured height drives `--app-banner-height`
 * (set inline on the AppShell root by AppShellShell — see globals.css).
 */
export const BANNER_HEIGHT_PX = 25;

export interface BannerConfig {
  text: string;
  color: MantineColor;
}

export interface BannerFormValues {
  enabled: boolean;
  text: string;
  color: string;
}

export interface BannerFormErrors {
  text?: string;
  [key: string]: string | undefined;
}

export function isBannerColor(value: unknown): value is MantineColor {
  return (
    typeof value === "string" && BANNER_COLORS.some((option) => option.key === value)
  );
}

/** Resolve any stored/raw color to a curated entry, defaulting when unknown. */
export function normalizeBannerColor(raw: unknown): MantineColor {
  return isBannerColor(raw) ? raw : BANNER_DEFAULT_COLOR;
}

/** The curated option for a resolved color. */
export function bannerColorOption(color: MantineColor): BannerColorOption {
  return BANNER_COLORS.find((option) => option.key === color) ?? BANNER_COLORS[0];
}

/**
 * Human-readable label for the stored color (audit details, settings UI):
 * e.g. "Red" or "Navy (default)" when unset/unknown.
 */
export function formatBannerColorLabel(color: string | null | undefined): string {
  const normalized = normalizeBannerColor(color);
  const label = bannerColorOption(normalized).label;
  return isBannerColor(color) ? label : `${label} (default)`;
}

/**
 * Trim the banner text; null when empty or over the length cap. Empty is
 * allowed only while the banner is disabled — `validateBannerForm` gates that.
 */
export function normalizeBannerText(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > BANNER_TEXT_MAX_LENGTH) {
    return null;
  }
  return value;
}

/**
 * An enabled banner needs text within the length cap; a disabled one only
 * needs its kept text to stay within the cap so re-enabling can't be blocked
 * by stale content.
 */
export function validateBannerForm(values: BannerFormValues): BannerFormErrors {
  const errors: BannerFormErrors = {};
  const text = values.text.trim();

  if (!text) {
    if (values.enabled) {
      errors.text = "Banner text is required";
    }
  } else if (text.length > BANNER_TEXT_MAX_LENGTH) {
    errors.text = `Banner text must be ${BANNER_TEXT_MAX_LENGTH} characters or fewer`;
  }

  return errors;
}
