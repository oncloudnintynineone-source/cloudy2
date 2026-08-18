"use client";

import { Affix, Button, Group, type ButtonProps } from "@mantine/core";

interface FloatingToolbarProps {
  children: React.ReactNode;
  bottomOffset?: string;
  /** Affix z-index. Raise above modal/overlay z-indexes to stay clickable while other modals are open. */
  zIndex?: number;
}

type FloatingActionButtonProps = ButtonProps & React.ComponentPropsWithoutRef<"button">;

/**
 * Shared floating action button, styled for the bottom-right toolbar.
 */
export function FloatingActionButton(props: FloatingActionButtonProps) {
  return (
    <Button
      radius="xl"
      h={43}
      style={{ boxShadow: "var(--mantine-shadow-md)" }}
      {...props}
    />
  );
}

/**
 * Floating action toolbar anchored bottom-right, clear of the device safe
 * area. Renders its children as a row of pills.
 */
export function FloatingToolbar({
  children,
  bottomOffset = "calc(env(safe-area-inset-bottom) + 16px)",
  zIndex = 100,
}: FloatingToolbarProps) {
  return (
    <Affix position={{ bottom: bottomOffset, right: 16 }} zIndex={zIndex}>
      <Group gap="xs" wrap="nowrap">
        {children}
      </Group>
    </Affix>
  );
}
