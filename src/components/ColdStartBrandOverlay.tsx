"use client";

import { Image, Text } from "@mantine/core";

import { isColdLaunchActive } from "@/lib/loading/coldLaunch";

/**
 * Decorative brand overlay riding dead-centre on the full-area dashboard
 * skeleton — app icon breathing on the ambient cadence over "Waking from
 * Deep Sleep…" (docs/loading-transitions.md §1.4). Cold-launch only: it paints
 * while the first document load is still settling and retires once the
 * cold-start machine reports the tail done, so soft navigations into the
 * Calendar route never re-trigger it. The client re-check also removes the
 * overlay when a cold-load RSC payload is replayed from the service worker's
 * cache on a later navigation. Purely visual: `aria-hidden` and
 * pointer-transparent; the sr-only `LoadingStatus` remains the only
 * announcement. Styling lives in the `c2-boot-*` rules in globals.css.
 */
export function ColdStartBrandOverlay() {
  if (!isColdLaunchActive()) return null;
  return (
    <div className="c2-boot-brand" aria-hidden="true">
      <Image src="/icon.svg" alt="" className="c2-boot-icon" draggable={false} />
      <Text className="c2-boot-text" size="sm" c="dimmed">
        Waking from Deep Sleep…
      </Text>
    </div>
  );
}
