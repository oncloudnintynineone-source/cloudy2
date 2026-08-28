"use client";

import { useMemo } from "react";
import { Badge, Tooltip } from "@mantine/core";

import { readStaleStamp } from "@/lib/pwa/client";

/**
 * Subtle chip shown when the current document was served from the service
 * worker's cache. Reads the stamp injected by the SW's
 * cachedResponseWillBeUsed hook (window.__C2_STAMP__.cachedAt).
 */
export function SavedDataChip() {
  const stamp = useMemo(() => readStaleStamp(), []);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- stamp is a stable window stamp
  const info = useMemo(() => {
    if (!stamp?.cachedAt) return null;
    try {
      const d = new Date(stamp.cachedAt);
      if (Number.isNaN(d.getTime())) return null;
      const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return {
        label: `Saved · ${time}`,
        full: `Showing saved data from ${d.toLocaleString()}. Pull to refresh or tap Force refresh for the latest.`,
      };
    } catch {
      return null;
    }
  }, [stamp]);

  if (!info) return null;

  return (
    <Tooltip label={info.full} multiline maw={260} withArrow>
      <Badge size="xs" variant="light" color="gray" style={{ cursor: "default" }}>
        {info.label}
      </Badge>
    </Tooltip>
  );
}
