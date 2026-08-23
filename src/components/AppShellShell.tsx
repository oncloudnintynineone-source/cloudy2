"use client";

import {
  AppShell,
  Box,
  Group,
  NavLink,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconAddressBook,
  IconCalendarMonth,
  IconClipboardList,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconSettings,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { BOTTOM_NAV_HEIGHT, BOTTOM_NAV_HEIGHT_CSS } from "@/lib/bottomNav";
import { DESKTOP_MEDIA_QUERY } from "@/lib/theme";
import { useRememberedPage, writeUiState } from "@/lib/ui/uiStateClient";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  matches: (pathname: string) => boolean;
}

const CALENDAR: NavItem = {
  href: "/dashboard",
  label: "Calendar",
  icon: <IconCalendarMonth size={22} />,
  matches: (pathname) => pathname === "/dashboard" || pathname.startsWith("/dashboard"),
};

const PARADE_STATE: NavItem = {
  href: "/parade-state",
  label: "Parade State",
  icon: <IconClipboardList size={22} />,
  matches: (pathname) => pathname === "/parade-state" || pathname.startsWith("/parade-state"),
};

const CONTACTS: NavItem = {
  href: "/contacts",
  label: "Contacts",
  icon: <IconAddressBook size={22} />,
  matches: (pathname) => pathname === "/contacts" || pathname.startsWith("/contacts"),
};

const SETTINGS: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: <IconSettings size={22} />,
  matches: (pathname) => pathname === "/settings" || pathname.startsWith("/settings"),
};

// Desktop sidebar widths: full (labels) vs. the minimized icon rail.
const SIDEBAR_WIDTH = 240;
const SIDEBAR_RAIL_WIDTH = 64;

const NAV_ACTIVE_COLOR = "var(--mantine-color-brand-7)";
const NAV_IDLE_COLOR = "light-dark(var(--mantine-color-gray-6), var(--mantine-color-dark-1))";

/** Icon-only nav entry for the minimized sidebar rail; the label rides a tooltip. */
function RailNavButton({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Tooltip label={item.label} position="right">
      <UnstyledButton
        component={Link}
        href={item.href}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 4,
          color: active ? NAV_ACTIVE_COLOR : NAV_IDLE_COLOR,
        }}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
      >
        {item.icon}
      </UnstyledButton>
    </Tooltip>
  );
}

function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <UnstyledButton
      component={Link}
      href={item.href}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        paddingBlock: 6,
        minHeight: BOTTOM_NAV_HEIGHT,
        color: active ? NAV_ACTIVE_COLOR : NAV_IDLE_COLOR,
      }}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
    >
      {item.icon}
      <Text size="xs" fw={active ? 600 : 500}>
        {item.label}
      </Text>
    </UnstyledButton>
  );
}

export function AppShellShell({
  role,
  name,
  sidebarCollapsed,
  children,
}: {
  role: "admin" | "user";
  name: string;
  /** The remembered rail state, read from the `cloudy2.ui` cookie by the
   *  (protected) layout before first paint (the server renders exactly what
   *  was remembered — no client restore, no flash). */
  sidebarCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Remember the last visited page (incl. the /settings sub-tab) so a PWA
  // relaunch from the start URL can land back here — read by / at launch.
  useRememberedPage(pathname);

  // Desktop = the theme's lg breakpoint: the bottom nav collapses and a left
  // sidebar takes over navigation (AppShell navbar, hidden below the
  // breakpoint). Both read the same theme value so they can't drift.
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  // Desktop sidebar minimized to the icon rail, initialized from the
  // remembered state the (protected) layout read from the cookie before first
  // paint. The effect below converges the cookie on every toggle (writing
  // false too, so re-expanding is remembered).
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);
  useEffect(() => {
    writeUiState({ sidebarCollapsed: collapsed });
  }, [collapsed]);

  const items: NavItem[] =
    role === "admin"
      ? [CALENDAR, PARADE_STATE, CONTACTS, SETTINGS]
      : [CALENDAR, PARADE_STATE, CONTACTS];

  return (
    <AppShell
      // Extra top inset engages in standalone PWA mode on notched devices
      // (`viewport-fit=cover`): the navy header extends edge-to-edge behind
      // the status bar instead of letterboxing. Reports 0 in-browser.
      header={{ height: "calc(56px + env(safe-area-inset-top))" }}
      navbar={{
        width: collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH,
        breakpoint: "lg",
        collapsed: { mobile: true },
      }}
      footer={{ height: BOTTOM_NAV_HEIGHT_CSS, collapsed: isDesktop }}
      padding="md"
      className="app-shell-root"
    >
      <AppShell.Header
        style={{
          background: "var(--mantine-color-brand-7)",
          borderColor: "var(--mantine-color-brand-8)",
        }}
      >
        <Group h="100%" justify="space-between" px="md">
          <Text fw={700} size="lg" component={Link} href="/dashboard" td="none" c="white">
            Cloudy
          </Text>
          <Group gap="xs">
            <ThemeToggle />
            <UserMenu name={name} />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        p="md"
        style={{
          background: "var(--mantine-color-body)",
          borderRight: "1px solid var(--mantine-color-default-border)",
          // Mantine animates transform/top/height on the navbar; add width so
          // the rail resize animates in step with the main area's padding.
          transitionProperty: "transform, top, height, width",
        }}
      >
        <Stack gap="xs">
          {items.map((item) =>
            collapsed ? (
              <RailNavButton key={item.href} item={item} active={item.matches(pathname)} />
            ) : (
              <NavLink
                key={item.href}
                component={Link}
                href={item.href}
                label={item.label}
                leftSection={item.icon}
                active={item.matches(pathname)}
              />
            ),
          )}
        </Stack>
        <UnstyledButton
          mt="auto"
          onClick={() => setCollapsed((value) => !value)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 4,
            color: NAV_IDLE_COLOR,
          }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <IconLayoutSidebarLeftExpand size={22} />
          ) : (
            <IconLayoutSidebarLeftCollapse size={22} />
          )}
        </UnstyledButton>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>

      <AppShell.Footer
        style={{
          background: "var(--mantine-color-body)",
          borderTop: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Box
          style={{
            display: "flex",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {items.map((item) => (
            <NavButton key={item.href} item={item} active={item.matches(pathname)} />
          ))}
        </Box>
      </AppShell.Footer>
    </AppShell>
  );
}
