"use client";

import type { TablerIcon } from "@tabler/icons-react";
import {
  IconAlertCircle,
  IconAlarm,
  IconBell,
  IconBookmark,
  IconBook,
  IconBuilding,
  IconBubble,
  IconCalendar,
  IconCamera,
  IconCar,
  IconClock,
  IconCurrencyDollar,
  IconExternalLink,
  IconFile,
  IconFileText,
  IconFlag,
  IconGift,
  IconHeart,
  IconHome,
  IconInfoCircle,
  IconLink,
  IconMail,
  IconMapPin,
  IconMessageCircle,
  IconMusic,
  IconPhone,
  IconPlane,
  IconPrinter,
  IconQrcode,
  IconShield,
  IconShip,
  IconStar,
  IconTarget,
  IconTools,
  IconTrain,
  IconTrophy,
  IconUser,
  IconUsers,
  IconVideo,
  IconWorld,
} from "@tabler/icons-react";

import { DEFAULT_QUICK_LINK_ICON, normalizeQuickLinkIcon } from "@/lib/quickLinks/icons";

/**
 * Stored icon key → installed tabler icon (curated set:
 * src/lib/quickLinks/icons.ts). Component names follow the installed
 * @tabler/icons-react version, which renamed a few glyphs (chat → bubble,
 * dollar → currency-dollar, qr-code → qrcode, wrench → tools).
 */
const ICON_COMPONENTS: Record<string, TablerIcon> = {
  "external-link": IconExternalLink,
  link: IconLink,
  phone: IconPhone,
  mail: IconMail,
  chat: IconBubble,
  "message-circle": IconMessageCircle,
  "map-pin": IconMapPin,
  world: IconWorld,
  clock: IconClock,
  alarm: IconAlarm,
  calendar: IconCalendar,
  user: IconUser,
  users: IconUsers,
  "info-circle": IconInfoCircle,
  "alert-circle": IconAlertCircle,
  bell: IconBell,
  file: IconFile,
  "file-text": IconFileText,
  "qr-code": IconQrcode,
  video: IconVideo,
  camera: IconCamera,
  printer: IconPrinter,
  music: IconMusic,
  car: IconCar,
  train: IconTrain,
  ship: IconShip,
  plane: IconPlane,
  home: IconHome,
  building: IconBuilding,
  heart: IconHeart,
  shield: IconShield,
  dollar: IconCurrencyDollar,
  gift: IconGift,
  flag: IconFlag,
  trophy: IconTrophy,
  target: IconTarget,
  book: IconBook,
  wrench: IconTools,
  star: IconStar,
  bookmark: IconBookmark,
};

interface QuickLinkIconProps {
  iconKey: string | null;
  size?: number;
  /** Stroke color override (e.g. a Mantine palette entry). */
  color?: string;
}

/** Resolves a stored quick-link icon key to its tabler icon with a safe fallback. */
export function QuickLinkIcon({ iconKey, size = 16, color }: QuickLinkIconProps) {
  const key = normalizeQuickLinkIcon(iconKey);
  const Icon = ICON_COMPONENTS[key] ?? ICON_COMPONENTS[DEFAULT_QUICK_LINK_ICON];
  return <Icon size={size} color={color} />;
}
