"use client";

/**
 * Shared nav-chrome pieces used by both the shell's own surfaces
 * (`AppShellShell`: bottom nav, sidebar, rail) and the floating bottom-nav
 * pill (`FloatingBottomNav`): the nav entry model, its idle/active colours,
 * the icon wrapper that carries the count pill, and the optimistic press
 * feedback (`PendingDim`).
 */

import { Box } from "@mantine/core";
import { useLinkStatus } from "next/link";

import { useReportActivity } from "@/components/ActivityBar";
import { MOTION } from "@/lib/motion/timing";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  matches: (pathname: string) => boolean;
  /**
   * Optional count pill over the icon (the acting user's Double Booking
   * overlap count or KAH breach count over the next 30 days). Rendered only
   * when > 0.
   */
  badge?: number;
  /** Singular noun for the badge in the aria-label ("double booking", "KAH breach"). */
  badgeNoun?: string;
}

export const NAV_ACTIVE_COLOR =
  "light-dark(var(--mantine-color-brand-7), var(--mantine-color-brand-4))";
export const NAV_IDLE_COLOR = "light-dark(var(--mantine-color-gray-6), var(--mantine-color-dark-1))";

// Static style objects hoisted out of the render body: the shell re-renders on
// every pathname / pinned-events / badge / banner change, so these are shared
// rather than re-allocated each pass.
export const NAV_ICON_STYLE: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexShrink: 0,
};

/**
 * Subtle press feedback inside a nav `<Link>` while its navigation is in
 * flight: the icon dims until the route commits, and the shared activity bar
 * (`useLinkStatus`-driven) reports the navigation as busy. `useLinkStatus`
 * must run within the Link's subtree, hence this wrapper rather than state in
 * the button itself.
 */
export function PendingDim({ busyKey, children }: { busyKey: string; children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  useReportActivity(pending, busyKey);
  return (
    <Box style={{ opacity: pending ? 0.55 : 1, transition: `opacity ${MOTION.fade}ms ease` }}>
      {children}
    </Box>
  );
}

/** Amber count pill for a nav entry with a `badge` (aria-hidden; the count
 *  rides each surface's own `aria-label`). Keyed by the count so a changed
 *  value remounts the pill and replays its pop-in (docs/loading-transitions.md
 *  §1.17: badge tick). */
function navCountPill(item: NavItem): React.ReactNode {
  if (!item.badge || item.badge <= 0) {
    return null;
  }
  return (
    <span key={item.badge} className="c2-nav-badge" aria-hidden>
      {item.badge}
    </span>
  );
}

/** A nav icon in a `position: relative` wrapper so the count pill can ride its
 *  top-right corner. */
export function NavIcon({ item }: { item: NavItem }) {
  return (
    <Box style={NAV_ICON_STYLE}>
      {item.icon}
      {navCountPill(item)}
    </Box>
  );
}

/** Accessible name for a nav surface, including the badge count when present. */
export function navAriaLabel(item: NavItem): string {
  if (!item.badge || item.badge <= 0) {
    return item.label;
  }
  const noun = item.badgeNoun ?? "item";
  return `${item.label} — ${item.badge} ${item.badge === 1 ? noun : `${noun}s`}`;
}
