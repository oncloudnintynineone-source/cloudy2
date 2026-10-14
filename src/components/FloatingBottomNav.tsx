"use client";

import { Badge, Box, Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { forwardRef } from "react";

import {
  NAV_ACTIVE_COLOR,
  NAV_IDLE_COLOR,
  NAV_ICON_STYLE,
  NavIcon,
  navAriaLabel,
  PendingDim,
  type NavItem,
} from "@/components/navChrome";
import { BOTTOM_NAV_HEIGHT } from "@/lib/bottomNav";
import { MOTION } from "@/lib/motion/timing";

/**
 * Floating bottom navigation pill (below `lg`). Brought to the foreground as a
 * detached, inset rounded pill on the shared frosted surface instead of the
 * docked `AppShell.Footer` — see `.c2-floating-nav` in globals.css. The shell
 * owns the items/active predicate/tap handler; this component owns the pill,
 * the primary tiles and the `More` popup for the overflow entries.
 */

function NavButton({
  item,
  active,
  onTap,
  compact,
}: {
  item: NavItem;
  active: boolean;
  onTap: () => void;
  /** Icon-only variant for very small form-factor phones (≤ 360px): the
   *  label text can't fit beside 4-5 nav items, so it drops and the icon is
   *  centered with slightly more vertical padding. The button already carries
   *  `aria-label`, so accessibility is preserved. */
  compact?: boolean;
}) {
  return (
    <UnstyledButton
      component={Link}
      href={item.href}
      onClick={onTap}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingBlock: compact ? 8 : 6,
        minHeight: BOTTOM_NAV_HEIGHT,
        color: active ? NAV_ACTIVE_COLOR : NAV_IDLE_COLOR,
      }}
      aria-label={navAriaLabel(item)}
      title={item.badge ? navAriaLabel(item) : undefined}
      aria-current={active ? "page" : undefined}
    >
      <PendingDim busyKey={`bottom:${item.href}`}>
        <Box
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: compact ? 0 : 2,
          }}
        >
          <NavIcon item={item} />
          {!compact && (
            <Text
              size="xs"
              fw={active ? 600 : 500}
              style={{
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textAlign: "center",
              }}
            >
              {item.label}
            </Text>
          )}
        </Box>
      </PendingDim>
    </UnstyledButton>
  );
}

/**
 * The pill's "More" tile — the `Menu.Target` for the popup holding the entries
 * that don't fit as primary tiles (see `FOOTER_PRIMARY_HREFS`). Carries the
 * summed count of any badges living in the overflow so an off-screen alert is
 * still signalled.
 */
const MoreNavButton = forwardRef<
  HTMLButtonElement,
  { active: boolean; badge: number; compact?: boolean } & React.ComponentPropsWithoutRef<
    typeof UnstyledButton
  >
>(function MoreNavButton({ active, badge, compact, ...others }, ref) {
  return (
    <UnstyledButton
      // The injected `Menu.Target` props (onClick, aria-*, data-*) must reach
      // the button or the tile silently never opens the menu.
      {...others}
      ref={ref}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingBlock: compact ? 8 : 6,
        minHeight: BOTTOM_NAV_HEIGHT,
        color: active ? NAV_ACTIVE_COLOR : NAV_IDLE_COLOR,
      }}
      aria-label={badge > 0 ? `More — ${badge} item${badge === 1 ? "" : "s"} needing attention` : "More"}
    >
      <Box
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: compact ? 0 : 2,
        }}
      >
        <Box style={NAV_ICON_STYLE}>
          <IconDots size={22} />
          {badge > 0 ? (
            <span className="c2-nav-badge" aria-hidden>
              {badge}
            </span>
          ) : null}
        </Box>
        {!compact && (
          <Text
            size="xs"
            fw={active ? 600 : 500}
            style={{
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
          >
            More
          </Text>
        )}
      </Box>
    </UnstyledButton>
  );
});

export function FloatingBottomNav({
  items,
  overflow,
  overflowBadge,
  isActive,
  onTap,
  compact,
}: {
  items: NavItem[];
  overflow: NavItem[];
  overflowBadge: number;
  isActive: (item: NavItem) => boolean;
  onTap: (href: string) => void;
  compact?: boolean;
}) {
  return (
    <Box component="footer" className="c2-floating-nav c2-glass-surface" hiddenFrom="lg">
      <Box style={{ display: "flex", height: "100%" }}>
        {items.map((item) => (
          <NavButton
            key={item.href}
            item={item}
            active={isActive(item)}
            onTap={() => onTap(item.href)}
            compact={compact}
          />
        ))}
        <Menu
          position="top"
          width={220}
          withinPortal
          shadow="md"
          transitionProps={{
            transition: "pop-top-right",
            duration: MOTION.popover,
            exitDuration: MOTION.popover,
            timingFunction: "ease",
          }}
        >
          <Menu.Target>
            <MoreNavButton
              active={overflow.some(isActive)}
              badge={overflowBadge}
              compact={compact}
            />
          </Menu.Target>
          <Menu.Dropdown>
            {overflow.map((item) => (
              <Menu.Item
                key={item.href}
                component={Link}
                href={item.href}
                leftSection={item.icon}
                aria-label={item.badge ? navAriaLabel(item) : undefined}
                onClick={() => onTap(item.href)}
              >
                <Group justify="space-between" gap="md" wrap="nowrap">
                  <Text size="sm">{item.label}</Text>
                  {item.badge && item.badge > 0 ? (
                    <Badge size="xs" variant="light" color="accent" aria-hidden>
                      {item.badge}
                    </Badge>
                  ) : null}
                </Group>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Box>
    </Box>
  );
}
