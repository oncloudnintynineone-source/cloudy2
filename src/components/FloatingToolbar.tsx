"use client";

import { Affix, Group } from "@mantine/core";

interface FloatingToolbarProps {
  children: React.ReactNode;
}

/**
 * Floating action toolbar anchored bottom-right, clear of the device safe
 * area. Renders its children as a row of pills.
 */
export function FloatingToolbar({ children }: FloatingToolbarProps) {
  return (
    <Affix position={{ bottom: "calc(env(safe-area-inset-bottom) + 16px)", right: 16 }} zIndex={100}>
      <Group gap="xs" wrap="nowrap">
        {children}
      </Group>
    </Affix>
  );
}
