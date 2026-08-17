"use client";

import { Affix, Group } from "@mantine/core";

interface FloatingToolbarProps {
  children: React.ReactNode;
  bottomOffset?: string;
}

/**
 * Floating action toolbar anchored bottom-right, clear of the device safe
 * area. Renders its children as a row of pills.
 */
export function FloatingToolbar({
  children,
  bottomOffset = "calc(env(safe-area-inset-bottom) + 16px)",
}: FloatingToolbarProps) {
  return (
    <Affix position={{ bottom: bottomOffset, right: 16 }} zIndex={100}>
      <Group gap="xs" wrap="nowrap">
        {children}
      </Group>
    </Affix>
  );
}
