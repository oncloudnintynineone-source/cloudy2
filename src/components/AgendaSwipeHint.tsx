"use client";

import { Text } from "@mantine/core";

/**
 * Touch-only caption advertising the day swipe-to-change gesture. Styled like
 * the wizard's "Tap outside to minimize" hint: small, centered and
 * non-interactive (pointer-events: none) so it never steals a swipe. Shared by
 * the Agenda tab, the month day modal, the Dual Pane agenda pane and the
 * Parade State roster.
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
