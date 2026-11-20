"use client";

import { Image, Stack, Text } from "@mantine/core";

import { RotatingWaitLines } from "@/components/WaitOverlay";
import { isColdLaunchActive } from "@/lib/loading/coldLaunch";
import { COLD_START_WAIT_LINES } from "@/lib/loading/waitCopy";

/**
 * Decorative brand overlay riding dead-centre on the full-area dashboard
 * skeleton — app icon breathing on the ambient cadence over "Waking from
 * Deep Sleep…" (docs/loading-transitions.md §1.4), with a rotating playful
 * subline below (`RotatingWaitLines`, §1.4.1) so the longest wait in the app
 * — a cold start — reads as alive. The subline lines live in
 * `COLD_START_WAIT_LINES` and are mirrored (and drift-pinned) in the PWA
 * launch shell (`public/loading.html`), so both halves of the cold-start
 * surface rotate identically. Cold-launch only: it paints while the first
 * document load is still settling and retires once the cold-start machine
 * reports the tail done, so soft navigations into the Calendar route never
 * re-trigger it. The client re-check also removes the overlay when a
 * cold-load RSC payload is replayed from the service worker's cache on a
 * later navigation. Purely visual: `aria-hidden` and pointer-transparent; the
 * sr-only `LoadingStatus` remains the only announcement. Styling lives in the
 * `c2-boot-*` rules in globals.css.
 */
export function ColdStartBrandOverlay() {
  if (!isColdLaunchActive()) return null;
  return (
    <div className="c2-boot-brand" aria-hidden="true">
      <Image src="/icon.svg" alt="" className="c2-boot-icon" draggable={false} />
      {/* Headline + subline read as one group (tight gap), separate from the
          icon's wider brand gap. */}
      <Stack gap={2} align="center">
        <Text className="c2-boot-text" size="sm" c="dimmed">
          Waking from Deep Sleep…
        </Text>
        <RotatingWaitLines lines={COLD_START_WAIT_LINES} subline />
      </Stack>
    </div>
  );
}
