"use client";

import { AppShell, Box, Group, NavLink, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconAddressBook,
  IconCalendarMonth,
  IconClipboardList,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconSettings,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { BOTTOM_NAV_HEIGHT, BOTTOM_NAV_HEIGHT_CSS } from "@/lib/bottomNav";
import { DESKTOP_MEDIA_QUERY } from "@/lib/theme";
import { ImmersiveModeContext, type ImmersiveModeValue } from "@/lib/ui/immersiveMode";
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

// How long an optimistic nav highlight survives without a commit before
// reverting (stalled or offline request). Long enough to never flicker on a
// slow-but-alive connection, short enough that a dead tap doesn't lie about
// where you are.
const NAV_TAP_REVERT_MS = 6000;

/**
 * Subtle press feedback inside a nav `<Link>` while its navigation is in
 * flight: the icon dims until the route commits. `useLinkStatus` must run
 * within the Link's subtree, hence this wrapper rather than state in the
 * button itself.
 */
function PendingDim({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <Box style={{ opacity: pending ? 0.55 : 1, transition: "opacity 120ms ease" }}>{children}</Box>
  );
}

/** Icon-only nav entry for the minimized sidebar rail; the label rides a tooltip. */
function RailNavButton({
  item,
  active,
  onTap,
}: {
  item: NavItem;
  active: boolean;
  onTap: () => void;
}) {
  return (
    <Tooltip label={item.label} position="right">
      <UnstyledButton
        component={Link}
        href={item.href}
        onClick={onTap}
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
        <PendingDim>{item.icon}</PendingDim>
      </UnstyledButton>
    </Tooltip>
  );
}

function NavButton({ item, active, onTap }: { item: NavItem; active: boolean; onTap: () => void }) {
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
        paddingBlock: 6,
        minHeight: BOTTOM_NAV_HEIGHT,
        color: active ? NAV_ACTIVE_COLOR : NAV_IDLE_COLOR,
      }}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
    >
      <PendingDim>
        <Box style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          {item.icon}
          <Text size="xs" fw={active ? 600 : 500}>
            {item.label}
          </Text>
        </Box>
      </PendingDim>
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

  // Immersive ("fullscreen") mode: a Calendar button hides this shell's
  // chrome (header, bottom nav, desktop sidebar) and requests the page-level
  // Fullscreen API so the OS status bar / browser UI go too, where supported.
  // The CSS half is the `app-shell-immersive` class on the AppShell root
  // (globals.css); pages call enter/exit via useImmersiveMode() and exit on
  // unmount, so leaving the page always restores the chrome. A browser that
  // rejects the Fullscreen API (iOS pages) simply keeps the CSS-only mode.
  const [immersive, setImmersive] = useState(false);
  const enter = useCallback(() => {
    setImmersive(true);
    if (document.fullscreenElement === null) {
      document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {
        // Unsupported or rejected: stay in the CSS-only focus mode.
      });
    }
  }, []);
  const exit = useCallback(() => {
    setImmersive(false);
    if (document.fullscreenElement !== null) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // The user can leave the Fullscreen API state without our button (Esc on
  // desktop, the status-bar edge gesture on Android) — follow the browser's
  // truth back so the chrome can't get stranded hidden.
  useEffect(() => {
    const sync = () => setImmersive(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const immersiveMode: ImmersiveModeValue = useMemo(
    () => ({ active: immersive, enter, exit }),
    [immersive, enter, exit],
  );

  // Desktop sidebar minimized to the icon rail, initialized from the
  // remembered state the (protected) layout read from the cookie before first
  // paint. The effect below converges the cookie on every toggle (writing
  // false too, so re-expanding is remembered).
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);
  useEffect(() => {
    writeUiState({ sidebarCollapsed: collapsed });
  }, [collapsed]);

  // Optimistic nav highlight: `pathname` only moves when a navigation
  // commits, so on a slow connection taps used to read as dead. Track the
  // tapped href and light it immediately; two revert paths keep it honest —
  // the committed `pathname` (navigation landed; render-phase "adjust state
  // on prop change" sync below) and a short timer (stalled or offline
  // request), so the highlight can never stick to a destination that was
  // never reached.
  const [tappedHref, setTappedHref] = useState<string | null>(null);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setTappedHref(null);
  }
  useEffect(() => {
    if (tappedHref === null) {
      return;
    }
    const timer = window.setTimeout(() => setTappedHref(null), NAV_TAP_REVERT_MS);
    return () => window.clearTimeout(timer);
  }, [tappedHref]);

  const isActive = (item: NavItem) => item.matches(pathname) || item.href === tappedHref;
  const handleTap = (href: string) => setTappedHref(href);

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
      className={immersive ? "app-shell-root app-shell-immersive" : "app-shell-root"}
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
              <RailNavButton
                key={item.href}
                item={item}
                active={isActive(item)}
                onTap={() => handleTap(item.href)}
              />
            ) : (
              <NavLink
                key={item.href}
                component={Link}
                href={item.href}
                label={item.label}
                leftSection={<PendingDim>{item.icon}</PendingDim>}
                active={isActive(item)}
                onClick={() => handleTap(item.href)}
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

      <AppShell.Main>
        <ImmersiveModeContext.Provider value={immersiveMode}>
          {children}
        </ImmersiveModeContext.Provider>
      </AppShell.Main>

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
            <NavButton
              key={item.href}
              item={item}
              active={isActive(item)}
              onTap={() => handleTap(item.href)}
            />
          ))}
        </Box>
      </AppShell.Footer>
    </AppShell>
  );
}
