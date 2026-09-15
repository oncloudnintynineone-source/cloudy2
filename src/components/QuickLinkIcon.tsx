"use client";

import { useEffect, useState } from "react";
import { IconExternalLink, type TablerIcon } from "@tabler/icons-react";

import { DEFAULT_QUICK_LINK_ICON, normalizeQuickLinkIcon } from "@/lib/quickLinks/icons";

interface QuickLinkIconProps {
  iconKey: string | null;
  size?: number;
  /** Stroke color override (e.g. a Mantine palette entry). */
  color?: string;
}

/**
 * Resolves a stored quick-link icon key to its tabler icon with a safe fallback.
 *
 * The icon set (~39 glyphs) lives in a separate module loaded on first mount so
 * it never lands in the dashboard's initial chunk — the dashboard only renders
 * these when a quick-links menu opens. The default glyph shows until it loads
 * (a single already-bundled icon), then swaps in place.
 */
export function QuickLinkIcon({ iconKey, size = 16, color }: QuickLinkIconProps) {
  const [components, setComponents] = useState<Record<string, TablerIcon> | null>(null);

  useEffect(() => {
    let active = true;
    void import("./quickLinkIconMap").then((mod) => {
      if (active) {
        setComponents(mod.QUICK_LINK_ICON_COMPONENTS);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const key = normalizeQuickLinkIcon(iconKey);
  const Icon = components?.[key] ?? components?.[DEFAULT_QUICK_LINK_ICON] ?? IconExternalLink;
  return <Icon size={size} color={color} />;
}
