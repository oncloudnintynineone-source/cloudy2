"use client";

import {
  AppShell,
  Box,
  Button,
  Group,
  Indicator,
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
  IconPin,
  IconSettings,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { PinnedEventsPanel } from "@/components/PinnedEventsPanel";
import { ShellChromeContext, type ShellChromeValue } from "@/components/ShellChrome";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { BANNER_HEIGHT_PX } from "@/lib/banner/banner";
import { BOTTOM_NAV_HEIGHT } from "@/lib/bottomNav";
import { countPinnedEvents } from "@/lib/events/pinned";
import type { Rect } from "@/lib/motion/origin";
import { DESKTOP_MEDIA_QUERY } from "@/lib/theme";
import { StatusAnnouncer } from "@/lib/ui/announcer";
import { ImmersiveModeContext, type ImmersiveModeValue } from "@/lib/ui/immersiveMode";
import {
  PinnedPanelContext,
  PINNED_EVENTS_CHANGED_EVENT,
  type PinnedPanelValue,
} from "@/lib/ui/pinnedPanel";
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

const KAH_STATUS: NavItem = {
  href: "/kah-status",
  label: "KAH Status",
  icon: <IconUsersGroup size={22} />,
  matches: (pathname) => pathname === "/kah-status" || pathname.startsWith("/kah-status"),
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

// The navy brand bar's height; the shell header stacks the optional
// announcement banner (admin-picked height preset) on top of it.
const HEADER_HEIGHT_PX = 56;

export function AppShellShell({
  role,
  name,
  sidebarCollapsed,
  bannerSlot,
  kahNavSlot,
  children,
}: {
  role: "admin" | "user";
  name: string;
  /** The remembered rail state, read from the `cloudy2.ui` cookie by the
   *  (protected) layout before first paint (the server renders exactly what
   *  was remembered — no client restore, no flash). */
  sidebarCollapsed: boolean;
  /** Streamed announcement-banner slot (a <Suspense> from the (protected)
   *  layout). Renders the banner — or its pending placeholder — above the navy
   *  bar; a null resolve collapses the reserved space. Streamed so the shell's
   *  first paint never waits on the banner's DB read. */
  bannerSlot?: React.ReactNode;
  /** Streamed KAH-status probe (a <Suspense> from the (protected) layout);
   *  reveals the KAH Status nav entry when the signed-in user belongs to a
   *  group. Null for admins (they always see it). */
  kahNavSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Remember the last visited page (incl. the /settings sub-tab) so a PWA
  // relaunch from the start URL can land back here — read by / at launch.
  useRememberedPage(pathname);

  // The Pinned Events agenda: the shell owns the open/close state because it
  // renders the header button; the panel reads it through the context. Opening
  // is a transient client state — never persisted. The header is global, so
  // tapping the pin from another page navigates to the dashboard first (the
  // shell stays mounted across the navigation, so the modal survives it).
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const router = useRouter();
  // The header button's rect at open time: the panel modal zooms out of /
  // shrinks back into it. Captured before any navigation — the header is
  // persistent, so the origin stays correct across the jump to /dashboard.
  const [pinnedOriginRect, setPinnedOriginRect] = useState<Rect | null>(null);
  const openPinnedPanel = useCallback(
    (originRect: Rect | null) => {
      if (pathname !== "/dashboard") {
        router.push("/dashboard");
      }
      setPinnedOriginRect(originRect);
      setPinnedOpen(true);
    },
    [pathname, router],
  );
  const pinnedPanelValue: PinnedPanelValue = useMemo(
    () => ({
      open: pinnedOpen,
      originRect: pinnedOriginRect,
      openPanel: openPinnedPanel,
      closePanel: () => setPinnedOpen(false),
    }),
    [pinnedOpen, pinnedOriginRect, openPinnedPanel],
  );

  // Header count badge: how many department-pinned events are upcoming. Fetched
  // on mount (background, so it never blocks a page load), again after the
  // panel closes (its fetch just pulled fresh data), on tab refocus (the
  // rolling window drifts as events end), and whenever event CRUD runs
  // (`PINNED_EVENTS_CHANGED_EVENT`). Best-effort — a failure keeps the last
  // count.
  const [pinnedCount, setPinnedCount] = useState(0);
  const refreshPinnedCount = useCallback(() => {
    void countPinnedEvents()
      .then((count) => setPinnedCount(count))
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshPinnedCount();
  }, [refreshPinnedCount]);
  const didOpenPanelRef = useRef(false);
  useEffect(() => {
    if (pinnedOpen) {
      didOpenPanelRef.current = true;
      return;
    }
    if (didOpenPanelRef.current) {
      refreshPinnedCount();
    }
  }, [pinnedOpen, refreshPinnedCount]);
  useEffect(() => {
    const onChange = () => refreshPinnedCount();
    window.addEventListener(PINNED_EVENTS_CHANGED_EVENT, onChange);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshPinnedCount();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(PINNED_EVENTS_CHANGED_EVENT, onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshPinnedCount]);

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

  // Measured banner height (px). Starts at the base height; updated by the
  // streamed AnnouncementBanner (via the shell chrome context) after layout so
  // the shell's offset math stays exact when text wraps to multiple lines.
  const [bannerPx, setBannerPx] = useState(BANNER_HEIGHT_PX);
  // Whether a banner is present. Defaults true while the streamed slot is
  // pending (the placeholder reserves BANNER_HEIGHT_PX); BannerLoaded collapses
  // the reserved space when the stream resolves to null.
  const [bannerActive, setBannerActive] = useState(true);
  // Whether the signed-in non-admin user belongs to at least one KAH group —
  // reveals the KAH Status nav entry once the streamed probe resolves true.
  const [kahGroup, setKahGroup] = useState(false);

  const shellChrome: ShellChromeValue = useMemo(
    () => ({
      setBannerActive,
      setBannerHeight: (px) => {
        if (px > 0) setBannerPx(px);
      },
      setKahGroup,
    }),
    [setBannerActive, setBannerPx, setKahGroup],
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
      ? [CALENDAR, PARADE_STATE, CONTACTS, KAH_STATUS, SETTINGS]
      : kahGroup
        ? [CALENDAR, PARADE_STATE, CONTACTS, KAH_STATUS]
        : [CALENDAR, PARADE_STATE, CONTACTS];

  // --- iOS PWA viewport sync ---
  // On some iOS versions, 100dvh/vh resolves to the full screen height but the
  // actual layout viewport is shorter (excludes the top safe-area inset). This
  // causes Mantine's dvh-based sizing to overshoot, making the document
  // scrollable and pushing content under the fixed header/footer.
  // Measure the real layout viewport and shell chrome, feed them back as CSS
  // variables that globals.css and Mantine's stylesheets consume.
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // Only run viewport sync in standalone PWA mode — in normal browser mode
    // 100dvh already tracks the keyboard-aware dynamic viewport correctly.
    if (!window.matchMedia("(display-mode: standalone)").matches) return;

    const sync = () => {
      const vh = document.documentElement.clientHeight;
      el.style.setProperty("--app-shell-vh", `${vh}px`);

      if (!immersive) {
        const header = el.querySelector<HTMLElement>(":scope > header");
        const footer = el.querySelector<HTMLElement>(":scope > footer");
        if (header) {
          el.style.setProperty(
            "--app-shell-header-offset",
            `${header.getBoundingClientRect().height}px`,
          );
        }
        if (footer) {
          el.style.setProperty(
            "--app-shell-footer-offset",
            `${footer.getBoundingClientRect().height}px`,
          );
        }
      } else {
        el.style.removeProperty("--app-shell-header-offset");
        el.style.removeProperty("--app-shell-footer-offset");
      }
    };

    sync();
    const id = setInterval(sync, 500);
    window.addEventListener("resize", sync);
    const onOrientation = () => setTimeout(sync, 400);
    window.addEventListener("orientationchange", onOrientation);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", onOrientation);
      vv?.removeEventListener("resize", sync);
      el.style.removeProperty("--app-shell-vh");
      el.style.removeProperty("--app-shell-header-offset");
      el.style.removeProperty("--app-shell-footer-offset");
    };
  }, [immersive]);

  const pinnedButton = (
    <Button
      variant="filled"
      radius="xl"
      size="compact-sm"
      bg="brand.8"
      c="white"
      leftSection={<IconPin size={14} />}
      onClick={(e) => openPinnedPanel(e.currentTarget.getBoundingClientRect())}
      aria-label={pinnedCount > 0 ? `Pinned events (${pinnedCount})` : "Pinned events"}
    >
      Pinned events
    </Button>
  );

  return (
    <>
      {/* Keyboard skip link: first focusable element in the app, targets the
          main content region below (visible only while focused). */}
      <a href="#main-content" className="c2-skip-link">
        Skip to content
      </a>
      <AppShell
        ref={rootRef}
        // `--app-banner-height` (absent by default → 0px from the class, the
        // measured height when a banner is active) feeds
        // `--app-shell-header-offset` in globals.css. Set as an inline custom
        // property on the root so the cascade can't drift between class
        // declarations. (Not the `vars` prop — in Mantine v9 that's a
        // resolver *function*, not an object.) In immersive mode the banner
        // is hidden, so we omit the variable to keep --app-banner-height at
        // its CSS default of 0px.
        style={
          bannerActive && !immersive
            ? ({ "--app-banner-height": `${bannerPx}px` } as React.CSSProperties)
            : undefined
        }
        // Extra top inset engages in standalone PWA mode on notched devices
        // (`viewport-fit=cover`): the navy header extends edge-to-edge behind
        // the status bar instead of letterboxing. Reports 0 in-browser. The
        // banner (when active) stacks above the 56px brand bar inside the
        // same header element. In immersive mode the header is hidden, so we
        // drop the banner height from the prop to avoid Mantine allocating
        // phantom main-content padding.
        header={{
          height:
            bannerActive && !immersive
              ? `calc(env(safe-area-inset-top) + ${bannerPx}px + ${HEADER_HEIGHT_PX}px)`
              : `calc(${HEADER_HEIGHT_PX}px + env(safe-area-inset-top))`,
        }}
        navbar={{
          width: collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH,
          breakpoint: "lg",
          collapsed: { mobile: true },
        }}
        footer={{ height: `${BOTTOM_NAV_HEIGHT}px`, collapsed: isDesktop }}
        padding="md"
        className={immersive ? "app-shell-root app-shell-immersive" : "app-shell-root"}
      >
        <AppShell.Header
          style={{
            background: "var(--mantine-color-brand-7)",
            borderColor: "var(--mantine-color-brand-8)",
            // The safe-area region stays navy; the banner + brand bar render
            // below it. Column layout only when a banner is stacked on top —
            // otherwise the single Group keeps today's row rendering.
            paddingTop: "env(safe-area-inset-top)",
            display: bannerActive && !immersive ? "flex" : undefined,
            flexDirection: bannerActive ? "column" : undefined,
          }}
        >
          <ShellChromeContext.Provider value={shellChrome}>
            {kahNavSlot}
            {bannerSlot}
            <Group h={HEADER_HEIGHT_PX} justify="space-between" px="md">
              <Text fw={700} size="lg" component={Link} href="/dashboard" td="none" c="white">
                Cloudy
              </Text>
              <Group gap="xs">
                {pinnedCount > 0 ? (
                  <Indicator
                    position="top-start"
                    size={18}
                    offset={4}
                    color="accent"
                    withBorder
                    // The count already rides the button's aria-label; hide the
                    // visual badge so screen readers don't read it twice.
                    label={<span aria-hidden>{pinnedCount > 99 ? "99+" : pinnedCount}</span>}
                  >
                    {pinnedButton}
                  </Indicator>
                ) : (
                  pinnedButton
                )}
                <ThemeToggle />
                <UserMenu name={name} />
              </Group>
            </Group>
          </ShellChromeContext.Provider>
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

        <AppShell.Main id="main-content" tabIndex={-1}>
          <ImmersiveModeContext.Provider value={immersiveMode}>
            <PinnedPanelContext.Provider value={pinnedPanelValue}>
              <StatusAnnouncer />
              {children}
              <PinnedEventsPanel />
            </PinnedPanelContext.Provider>
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
    </>
  );
}
