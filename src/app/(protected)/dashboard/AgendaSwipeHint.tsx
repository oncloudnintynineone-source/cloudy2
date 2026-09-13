"use client";

import { Text } from "@mantine/core";

/**
 * Touch-only caption advertising the agenda swipe-to-change-day gesture.
 * Styled like the wizard's "Tap outside to minimize" hint: small, centered and
 * non-interactive (pointer-events: none) so it never steals a swipe. Shared by
 * the Agenda tab, the month day modal and the Dual Pane agenda pane.
 */
export function AgendaSwipeHint() {
  return (
    <Text
      size="xs"
      c="dimmed"
      ta="center"
      mt="xs"
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      Swipe left or right to change day
    </Text>
  );
}
