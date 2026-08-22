"use client";

import { Affix, Button, Group, type ButtonProps } from "@mantine/core";

interface FloatingToolbarProps {
  children: React.ReactNode;
  bottomOffset?: string;
  /** Affix z-index. Raise above modal/overlay z-indexes to stay clickable while other modals are open. */
  zIndex?: number;
}

type FloatingActionButtonProps = ButtonProps & React.ComponentPropsWithoutRef<"button">;

/** FAB diameter: 1.5× the original 43px touch target. */
export const FAB_SIZE = 65;

/** Icon size for FABs: 1.5× the original 20px, in step with `FAB_SIZE`. */
export const FAB_ICON_SIZE = 30;

/**
 * Shared floating action button: a 65px circle for the bottom-right toolbar.
 * Icon-only — pass the icon as children (at `FAB_ICON_SIZE`) and an
 * `aria-label` for accessibility.
 */
export function FloatingActionButton(props: FloatingActionButtonProps) {
  return (
    <Button
      radius="50%"
      w={FAB_SIZE}
      h={FAB_SIZE}
      style={{ boxShadow: "var(--mantine-shadow-md)" }}
      {...props}
    />
  );
}

/**
 * Floating action toolbar anchored bottom-right, clear of the device safe
 * area. Renders its children as a row of circles.
 */
export function FloatingToolbar({
  children,
  bottomOffset = "var(--app-floating-bottom-offset)",
  zIndex = 100,
}: FloatingToolbarProps) {
  return (
    // Render inline (not portaled): the bottom offsets are page-scoped CSS
    // vars (--app-floating-bottom-offset on .app-shell-root,
    // --settings-fab-bottom on .settings-page-pad) and a portal to <body>
    // would escape their scope, leaving `bottom` unresolved.
    <Affix position={{ bottom: bottomOffset, right: 16 }} zIndex={zIndex} withinPortal={false}>
      <Group gap="xs" wrap="nowrap">
        {children}
      </Group>
    </Affix>
  );
}
