/**
 * Pure data for the curated quick-link icon set: the keys an admin can pick
 * and their human-readable labels. The actual tabler icon components live in
 * the client-only `src/components/QuickLinkIcon.tsx`; this module stays free
 * of component imports so server code (audit details) can use it too.
 *
 * Kept free of I/O so it can be unit-tested without a database.
 */

export interface QuickLinkIconMeta {
  key: string;
  label: string;
}

/** The selectable quick-link icons, in picker display order. */
export const QUICK_LINK_ICONS: readonly QuickLinkIconMeta[] = [
  { key: "external-link", label: "External link" },
  { key: "link", label: "Link" },
  { key: "phone", label: "Phone" },
  { key: "mail", label: "Mail" },
  { key: "chat", label: "Chat" },
  { key: "message-circle", label: "Message" },
  { key: "map-pin", label: "Map pin" },
  { key: "world", label: "World" },
  { key: "clock", label: "Clock" },
  { key: "alarm", label: "Alarm" },
  { key: "calendar", label: "Calendar" },
  { key: "user", label: "User" },
  { key: "users", label: "Users" },
  { key: "info-circle", label: "Info" },
  { key: "alert-circle", label: "Alert" },
  { key: "bell", label: "Bell" },
  { key: "file", label: "File" },
  { key: "file-text", label: "Document" },
  { key: "qr-code", label: "QR code" },
  { key: "video", label: "Video" },
  { key: "camera", label: "Camera" },
  { key: "printer", label: "Printer" },
  { key: "music", label: "Music" },
  { key: "car", label: "Car" },
  { key: "train", label: "Train" },
  { key: "ship", label: "Ship" },
  { key: "plane", label: "Plane" },
  { key: "home", label: "Home" },
  { key: "building", label: "Building" },
  { key: "heart", label: "Heart" },
  { key: "shield", label: "Shield" },
  { key: "dollar", label: "Dollar" },
  { key: "gift", label: "Gift" },
  { key: "flag", label: "Flag" },
  { key: "trophy", label: "Trophy" },
  { key: "target", label: "Target" },
  { key: "book", label: "Book" },
  { key: "wrench", label: "Wrench" },
  { key: "star", label: "Star" },
  { key: "bookmark", label: "Bookmark" },
];

/** The icon used when a stored value is unknown/missing. */
export const DEFAULT_QUICK_LINK_ICON = "external-link";

export function isQuickLinkIconKey(value: unknown): value is string {
  return typeof value === "string" && QUICK_LINK_ICONS.some((meta) => meta.key === value);
}

/** Normalize a stored icon key; unknown/missing values fall back to the default. */
export function normalizeQuickLinkIcon(raw: unknown): string {
  return isQuickLinkIconKey(raw) ? (raw as string) : DEFAULT_QUICK_LINK_ICON;
}

/** Human-readable label for a stored icon key (settings lists, audit details). */
export function formatQuickLinkIconLabel(raw: unknown): string {
  const normalized = normalizeQuickLinkIcon(raw);
  const meta = QUICK_LINK_ICONS.find((entry) => entry.key === normalized);
  return meta?.label ?? normalized;
}
