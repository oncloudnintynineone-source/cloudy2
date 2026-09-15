"use client";

import { Affix, Button, Group, type ButtonProps } from "@mantine/core";

interface FloatingToolbarProps {
  children: React.ReactNode;
  bottomOffset?: string;
  /** Affix z-index. Raise above modal/overlay z-indexes to stay clickable while other modals are open. */
  zIndex?: number;
  /**
   * Responsive visibility breakpoint, e.g. hiddenFrom="lg" = mobile-only
   * toolbar (Mantine style-prop semantics). MUST be passed here rather than to
   * a wrapper element: the Affix below portals its content to <body>, so a
   * wrapper's display:none would only ever hide an empty div while the FABs
   * stay visible at every breakpoint.
   */
  hiddenFrom?: string;
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
export function FloatingActionButton({ className, ...props }: FloatingActionButtonProps) {
  return (
    <Button
      radius="50%"
      w={FAB_SIZE}
      h={FAB_SIZE}
      // `c2-press` gives the FAB a touch pressed-state (no hover on mobile).
      className={className ? `c2-press ${className}` : "c2-press"}
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
  hiddenFrom,
}: FloatingToolbarProps) {
  return (
    // Portaled to <body> (Mantine default): `position: fixed` must stay
    // viewport-relative no matter what the page's layout does to its
    // ancestors. The bottom offsets are CSS vars declared on :root
    // (globals.css), so they resolve from the portaled element too.
    // Responsive props like hiddenFrom land on this portaled Affix root
    // (Affix forwards them to its Box), which is why they work while a
    // wrapper around this component cannot.
    <Affix
      position={{ bottom: bottomOffset, right: 16 }}
      zIndex={zIndex}
      hiddenFrom={hiddenFrom}
    >
      <Group gap="xs" wrap="nowrap">
        {children}
      </Group>
    </Affix>
  );
}
