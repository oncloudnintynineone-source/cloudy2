"use client";

import { Affix, Group } from "@mantine/core";

interface FloatingToolbarProps {
  children: React.ReactNode;
}

/**
 * Floating action toolbar anchored bottom-right, above the fixed bottom nav
 * bar (64px footer + 12px gap). Renders its children as a row of pills.
 */
export function FloatingToolbar({ children }: FloatingToolbarProps) {
  return (
    <Affix position={{ bottom: 76, right: 16 }} zIndex={200}>
      <Group gap="xs" wrap="nowrap">
        {children}
      </Group>
    </Affix>
  );
}
