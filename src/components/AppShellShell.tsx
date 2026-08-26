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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { type BannerConfig, BANNER_HEIGHT_PX, bannerColorOption } from "@/lib/banner/banner";
import { BOTTOM_NAV_HEIGHT } from "@/lib/bottomNav";
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

// The navy brand bar's height; the shell header stacks the optional
// announcement banner (admin-picked height preset) on top of it.
const HEADER_HEIGHT_PX = 56;

/**
 * The admin-managed announcement banner: a min-height strip (25px) above the
 * navy brand bar, filled with its curated palette color (`-filled` var, so
 * light/dark schemes both work) and the readable text color that option pins.
 * Text wraps and the banner grows taller when it overflows the base height.
 * The measured height is fed into `--app-banner-height` (set inline on the
 * AppShell root, see globals.css) so the shell's offset math stays exact.
 */
function AnnouncementBanner({
  config,
  onMeasure,
}: {
  config: BannerConfig;
  onMeasure: (px: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const option = bannerColorOption(config.color);

  useEffect(() => {
    if (!ref.current) return;
    onMeasure(ref.current.offsetHeight);
  });

  return (
    <div
      ref={ref}
      role="status"
      title={config.text}
      style={{
        flexShrink: 0,
        minHeight: BANNER_HEIGHT_PX,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingInline: "var(--mantine-spacing-md)",
        textAlign: "center",
        background: `var(--mantine-color-${config.color}-filled)`,
        color:
          option.textColor === "dark"
            ? "var(--mantine-color-black)"
            : "var(--mantine-color-white)",
        fontSize: "var(--mantine-font-size-sm)",
        fontWeight: 500,
      }}
    >
      <span style={{ width: "100%", overflowWrap: "break-word" }}>{config.text}</span>
    </div>
  );
}

export function AppShellShell({
  role,
  name,
  sidebarCollapsed,
  banner,
  children,
}: {
  role: "admin" | "user";
  name: string;
  /** The remembered rail state, read from the `cloudy2.ui` cookie by the
   *  (protected) layout before first paint (the server renders exactly what
   *  was remembered — no client restore, no flash). */
  sidebarCollapsed: boolean;
  /** Admin-managed announcement banner, or null when disabled (no reserved
   *  space — today's layout). Rendered inside the header above the navy bar;
   *  `--app-shell-header-offset` grows via the inline `--app-banner-height`. */
  banner?: BannerConfig | null;
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

  // Measured banner height (px). Starts at the base height; updated by
  // AnnouncementBanner's onMeasure callback after layout so the shell's
  // offset math stays exact when text wraps to multiple lines.
  const [bannerPx, setBannerPx] = useState(BANNER_HEIGHT_PX);
  const measureBanner = useCallback((px: number) => {
    if (px > 0) setBannerPx(px);
  }, []);

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

  return (
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
        banner && !immersive
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
        height: banner && !immersive
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
          display: banner && !immersive ? "flex" : undefined,
          flexDirection: banner ? "column" : undefined,
        }}
      >
        {banner ? <AnnouncementBanner config={banner} onMeasure={measureBanner} /> : null}
        <Group h={HEADER_HEIGHT_PX} justify="space-between" px="md">
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
