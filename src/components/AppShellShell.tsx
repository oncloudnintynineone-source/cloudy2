"use client";

import {
  ActionIcon,
  AppShell,
  Box,
  Group,
  NavLink,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useHotkeys, useMediaQuery } from "@mantine/hooks";
import {
  IconAddressBook,
  IconCalendarClock,
  IconCalendarMonth,
  IconClipboardList,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";

import { PinnedEventsPanel } from "@/components/PinnedEventsPanel";
import { PinnedEventsTicker } from "@/components/PinnedEventsTicker";
import { NavRouteWarmer } from "@/components/NavRouteWarmer";
import EventSearchModalSkeleton from "@/components/EventSearchModalSkeleton";
import { ColdStartReadyBar, useColdStartReady } from "@/components/ColdStartReady";
import { ActivityBar, ActivityProvider, useReportActivity } from "@/components/ActivityBar";
import {
  AnnouncementBanner,
  ShellChromeContext,
  type ShellChromeValue,
} from "@/components/ShellChrome";

// Lazy-loaded so the search modal (its AgendaView + DatePicker imports) stays
// out of the shell's initial bundle — it only loads once the user opens search.
// The lightweight skeleton is the fallback for a click that races the chunk
// download, so the tap always paints an immediate dialog.
const EventSearchModal = dynamic(() => import("@/components/EventSearchModal"), {
  ssr: false,
  loading: () => <EventSearchModalSkeleton />,
});

// `next/dynamic` returns a `React.ComponentType`, but the runtime Loadable also
// carries a `.preload()` static that fetches the chunk without mounting. Preload
// in the background so the modal's first open is instant rather than a
// chunk-download round trip. Returns the preload promise (when available) so the
// caller can mount the modal closed as soon as the chunk lands.
const preloadSearchModalChunk = () =>
  (EventSearchModal as unknown as { preload?: () => Promise<unknown> }).preload?.();
import { UserMenu } from "@/components/UserMenu";
import { BANNER_HEIGHT_PX, type BannerConfig } from "@/lib/banner/banner";
import { BOTTOM_NAV_HEIGHT } from "@/lib/bottomNav";
import { fetchPinnedEvents, type PinnedEvent } from "@/lib/events/pinned";
import type { PinnedTickerIndicator } from "@/lib/settings/featureFlags";
import type { Rect } from "@/lib/motion/origin";
import { MOTION } from "@/lib/motion/timing";
import { useInactivityRefresh, useOneShotRefreshStrip } from "@/lib/pwa/client";
import { DESKTOP_MEDIA_QUERY, DESKTOP_WIDE_MEDIA_QUERY, NARROW_MEDIA_QUERY } from "@/lib/theme";
import { StatusAnnouncer } from "@/lib/ui/announcer";
import { ImmersiveModeContext, type ImmersiveModeValue } from "@/lib/ui/immersiveMode";
import {
  PinnedPanelContext,
  PINNED_EVENTS_CHANGED_EVENT,
  type PinnedPanelValue,
} from "@/lib/ui/pinnedPanel";
import { useRememberedPage, writeUiState } from "@/lib/ui/uiStateClient";
import { EVENTS_CHANGED_EVENT } from "@/lib/ui/eventChanges";
import { checkUserClashes } from "@/lib/events/clashActions";
import { checkKahBreaches } from "@/lib/kah/statusActions";
import { withTimeout } from "@/lib/async";

interface NavItem {
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

const DOUBLE_BOOKING: NavItem = {
  href: "/double-booking",
  label: "Double Booking",
  icon: <IconCalendarClock size={22} />,
  matches: (pathname) => pathname === "/double-booking" || pathname.startsWith("/double-booking"),
  badgeNoun: "double booking",
};

const KAH_STATUS: NavItem = {
  href: "/kah-status",
  label: "KAH Status",
  icon: <IconUsersGroup size={22} />,
  matches: (pathname) => pathname === "/kah-status" || pathname.startsWith("/kah-status"),
  badgeNoun: "KAH breach",
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

const NAV_ACTIVE_COLOR =
  "light-dark(var(--mantine-color-brand-7), var(--mantine-color-brand-4))";
const NAV_IDLE_COLOR = "light-dark(var(--mantine-color-gray-6), var(--mantine-color-dark-1))";

// Static style objects hoisted out of the render body: this shell re-renders on
// every pathname / pinned-events / badge / banner change, so these are shared
// rather than re-allocated each pass.
const NAV_ICON_STYLE: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexShrink: 0,
};
const RAIL_BUTTON_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
};
const NAVBAR_STYLE: React.CSSProperties = {
  viewTransitionName: "c2-shell-navbar",
  background: "var(--mantine-color-body)",
  borderRight: "1px solid var(--mantine-color-default-border)",
  // Mantine animates transform/top/height on the navbar; add width so the rail
  // resize animates in step with the main area's padding.
  transitionProperty: "transform, top, height, width",
};
const HEADER_STYLE: React.CSSProperties = {
  viewTransitionName: "c2-shell-header",
  background: "var(--mantine-color-brand-7)",
  borderColor: "var(--mantine-color-brand-8)",
  // The safe-area region stays navy; the banner + brand bar render below it.
  paddingTop: "env(safe-area-inset-top)",
};

// How long an optimistic nav highlight survives without a commit before
// reverting (stalled or offline request). Long enough to never flicker on a
// slow-but-alive connection, short enough that a dead tap doesn't lie about
// where you are.
const NAV_TAP_REVERT_MS = 6000;

/**
 * Upper bound on a cold-start readiness leg (the pinned-events list and the
 * clash count). Both settle on success *or* failure, so the amber cold-start
 * bar can't pulse forever on a hung request; this bounds the genuinely
 * never-settling case (a stalled server action / cold backend).
 */
const COLD_LEG_TIMEOUT_MS = 12_000;

/**
 * Subtle press feedback inside a nav `<Link>` while its navigation is in
 * flight: the icon dims until the route commits, and the shared activity bar
 * (`useLinkStatus`-driven) reports the navigation as busy. `useLinkStatus`
 * must run within the Link's subtree, hence this wrapper rather than state in
 * the button itself.
 */
function PendingDim({ busyKey, children }: { busyKey: string; children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  useReportActivity(pending, busyKey);
  return (
    <Box style={{ opacity: pending ? 0.55 : 1, transition: `opacity ${MOTION.fade}ms ease` }}>
      {children}
    </Box>
  );
}

/** Amber count pill for a nav entry with a `badge` (aria-hidden; the count
 *  rides each surface's own `aria-label`). */
function navCountPill(item: NavItem): React.ReactNode {
  if (!item.badge || item.badge <= 0) {
    return null;
  }
  return (
    <span className="c2-nav-badge" aria-hidden>
      {item.badge}
    </span>
  );
}

/**
 * Reports the inactivity refresh's forced navigation on the shared activity
 * bar. It must live *inside* the `ActivityProvider` (the hook itself runs in
 * `AppShellShell`'s body, outside its own provider), so the shell passes the
 * pending flag down into the provider subtree. The forced nav is a same-path
 * soft navigation — no skeleton — so without this the refresh would be
 * invisible for its whole (cold serverless + Google) round trip.
 */
function InactivityActivityReporter({ pending }: { pending: boolean }) {
  useReportActivity(pending, "dashboard:background");
  return null;
}

/** A nav icon in a `position: relative` wrapper so the count pill can ride its
 *  top-right corner. */
function NavIcon({ item }: { item: NavItem }) {
  return (
    <Box style={NAV_ICON_STYLE}>
      {item.icon}
      {navCountPill(item)}
    </Box>
  );
}

/** Accessible name for a nav surface, including the badge count when present. */
function navAriaLabel(item: NavItem): string {
  if (!item.badge || item.badge <= 0) {
    return item.label;
  }
  const noun = item.badgeNoun ?? "item";
  return `${item.label} — ${item.badge} ${item.badge === 1 ? noun : `${noun}s`}`;
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
        style={{ ...RAIL_BUTTON_STYLE, color: active ? NAV_ACTIVE_COLOR : NAV_IDLE_COLOR }}
        aria-label={navAriaLabel(item)}
        aria-current={active ? "page" : undefined}
      >
        <PendingDim busyKey={`rail:${item.href}`}>
          <NavIcon item={item} />
        </PendingDim>
      </UnstyledButton>
    </Tooltip>
  );
}

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
   *  `aria-label={item.label}`, so accessibility is preserved. */
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

// The navy brand bar's height; the shell header stacks the optional
// announcement banner (admin-picked height preset) on top of it.
const HEADER_HEIGHT_PX = 56;

export function AppShellShell({
  role,
  name,
  phone,
  googleConfigured,
  sidebarCollapsed,
  bannerConfig,
  pinnedTickerIndicator,
  kahNavSlot,
  children,
}: {
  role: "admin" | "user";
  name: string;
  phone: string | null;
  /**
   * Whether the Google Calendar integration is configured (env-backed, read by
   * the (protected) layout). Gates the header Force refresh while on the
   * dashboard — a forced fetch with Google unconfigured would cache empties.
   */
  googleConfigured: boolean;
  /** The remembered rail state, read from the `cloudy2.ui` cookie by the
   *  (protected) layout before first paint (the server renders exactly what
   *  was remembered — no client restore, no flash). */
  sidebarCollapsed: boolean;
  /** The active announcement banner, resolved by the (protected) layout (in
   *  parallel with the session) and passed as a prop — never streamed. The
   *  shell derives its banner state from this on the very first render, so the
   *  header (banner stacked above the navy bar, or the bare 56px bar) and the
   *  route skeleton are aligned with the steady-state layout from first paint:
   *  no reservation while a read is pending, and no post-hydration shift in
   *  either direction (the server already knows whether a banner exists). */
  bannerConfig: BannerConfig | null;
  /** The pinned-events header pill's indicator style (Settings → Feature
   *  Flags), resolved by the (protected) layout from the settings row and
   *  passed as a prop like `bannerConfig`. */
  pinnedTickerIndicator: PinnedTickerIndicator;
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

  // A document that hard-loaded with the profile menu's one-shot `?refresh`
  // nonce strips it here (RSC entries cleared first, so the clean-URL replace
  // can't re-serve a stale payload). See useOneShotRefreshStrip in pwa/client.
  useOneShotRefreshStrip();

  // Refresh the current view when the tab returns to the foreground after a
  // long idle (see useInactivityRefresh in pwa/client). A backgrounded PWA
  // accumulates staleness that no navigation-driven refresh ever corrects. The
  // returned pending flag reports the forced refresh on the activity bar
  // (see InactivityActivityReporter below).
  const inactivityPending = useInactivityRefresh();

  // Cold-start readiness: the shell's two mount fetches (pinned events, clash
  // count) are the client-side tail of a fresh load — the readiness indicator
  // shows amber while they settle and confirms when they're done (see
  // docs/loading-transitions.md §1.13.1). Registration happens around the
  // *initial* fetches only; the later refreshes (panel close, tab refocus,
  // event CRUD) run untracked so the once-per-launch machine never re-arms.
  const { beginLeg, settleLeg } = useColdStartReady();

  // The Pinned Events agenda: the shell owns the open/close state because it
  // renders the header button; the panel reads it through the context. Opening
  // is a transient client state — never persisted. The header is global, so
  // tapping the pin from another page navigates to the dashboard first (the
  // shell stays mounted across the navigation, so the modal survives it).
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // The lazy search modal is mounted as soon as its chunk preloads (kept closed
  // until opened) so the first open is an instant prop flip — no mount, chunk
  // parse, or network wait on the click. It also stays mounted after the first
  // open so the shrink-out animation can play.
  const [searchLoaded, setSearchLoaded] = useState(false);
  // The search icon's rect at open time; the modal zooms out of / shrinks into it.
  const [searchOriginRect, setSearchOriginRect] = useState<Rect | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // Preload the modal's chunk and, once it lands, mount the modal closed so the
  // first open pays nothing. Called at idle and on every near signal (hover,
  // focus, pointer-down/touch-start, hotkey) — a promise that resolves
  // repeatedly is harmless.
  const preloadSearchModal = useCallback(() => {
    const promise = preloadSearchModalChunk();
    if (promise) {
      promise.then(() => setSearchLoaded(true)).catch(() => undefined);
    }
  }, []);

  // Preload shortly after first paint (idle, so it never competes with the
  // launch-critical work). The deadline keeps it from being starved on a busy
  // phone; the header button's hover/touch signals are nearer triggers.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const hasIdle = typeof window.requestIdleCallback === "function";
    let id: number;
    if (hasIdle) {
      id = window.requestIdleCallback(preloadSearchModal, { timeout: 2000 });
    } else {
      id = window.setTimeout(preloadSearchModal, 0);
    }
    return () => {
      if (hasIdle) {
        window.cancelIdleCallback(id);
      } else {
        window.clearTimeout(id);
      }
    };
  }, [preloadSearchModal]);

  // Open the search modal, growing it out of the header button (or the passed
  // rect). Mounts the lazy chunk if the preload hasn't landed yet (the dynamic
  // loading fallback covers that race).
  const openSearch = useCallback((originRect: Rect | null) => {
    setSearchOriginRect(originRect);
    setSearchLoaded(true);
    setSearchOpen(true);
  }, []);

  // Desktop keyboard shortcut: ⌘/Ctrl-K opens search from anywhere in the shell.
  useHotkeys([
    [
      "mod+K",
      () => openSearch(searchButtonRef.current?.getBoundingClientRect() ?? null),
      { preventDefault: true },
    ],
  ]);

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

  // Header Force refresh: a full document reload to a one-shot `?refresh`
  // nonce URL that the service worker never caches (ONE_SHOT_PARAMS) — always
  // a network render; on /dashboard the server parses the nonce and force-reads
  // Google. `useOneShotRefreshStrip` (below) drops the param right after the
  // reloaded document mounts. The ref only stops a double-click from
  // scheduling two navigations. Disabled on the calendar while Google is
  // unconfigured (a forced fetch there would cache empties and blank the grid);
  // everywhere else the nonce URL is never SW-cached, so the reload is a
  // network-fresh render there too.
  const isDashboard = pathname === "/dashboard";
  const refreshScheduled = useRef(false);
  const handleForceRefresh = useCallback(() => {
    if (refreshScheduled.current) return;
    refreshScheduled.current = true;
    const url = new URL(window.location.href);
    url.searchParams.set("refresh", String(Date.now()));
    window.location.assign(url.toString());
  }, []);

  // Header ticker data: the upcoming department-pinned events (titles
  // pre-rendered server-side). Fetched on mount (background, so it never
  // blocks a page load), again after the panel closes (its fetch just pulled
  // fresh data), on tab refocus (the rolling window drifts as events end),
  // and whenever event CRUD runs (`PINNED_EVENTS_CHANGED_EVENT`). Best-effort
  // — a failure keeps the last list. The ticker derives its count from the
  // list length.
  const [pinnedEvents, setPinnedEvents] = useState<PinnedEvent[] | null>(null);
  // Whether the *first* read has settled (and whether it failed). Only the
  // pill's accessible name consumes this — pending/error/empty all share the
  // static "Pinned events" look, but a screen reader must not hear a failed or
  // settled-empty read as "still loading".
  const [pinnedStatus, setPinnedStatus] = useState<"pending" | "ready" | "error">("pending");
  const refreshPinnedEvents = useCallback(() => {
    return fetchPinnedEvents()
      .then((events) => {
        setPinnedEvents(events);
        setPinnedStatus("ready");
      })
      .catch(() => setPinnedStatus("error"));
  }, []);
  useEffect(() => {
    // The cold-start read doubles as a readiness leg: begin before the fetch,
    // settle when it resolves *either way* (a failure still ends the load). A
    // timeout bounds the never-settling case so the bar can't hang.
    beginLeg("pinned");
    void withTimeout(refreshPinnedEvents(), COLD_LEG_TIMEOUT_MS).finally(() =>
      settleLeg("pinned"),
    );
  }, [refreshPinnedEvents, beginLeg, settleLeg]);
  const didOpenPanelRef = useRef(false);
  useEffect(() => {
    if (pinnedOpen) {
      didOpenPanelRef.current = true;
      return;
    }
    if (didOpenPanelRef.current) {
      void refreshPinnedEvents();
    }
  }, [pinnedOpen, refreshPinnedEvents]);
  useEffect(() => {
    const onChange = () => refreshPinnedEvents();
    window.addEventListener(PINNED_EVENTS_CHANGED_EVENT, onChange);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshPinnedEvents();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(PINNED_EVENTS_CHANGED_EVENT, onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshPinnedEvents]);

  // Desktop = the theme's lg breakpoint: the bottom nav collapses and a left
  // sidebar takes over navigation (AppShell navbar, hidden below the
  // breakpoint). Both read the same theme value so they can't drift.
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  // Wide-desktop band (≥ 800px): below it (unfolded foldables, 640–799px) the
  // full 240px sidebar would eat a third of the viewport, so the rail takes
  // over automatically on entry (effect below).
  const isDesktopWide = useMediaQuery(DESKTOP_WIDE_MEDIA_QUERY);
  // Very small form-factor phone (≤ 360px): the header's gutters and the
  // bottom nav's text labels don't fit, so they render compact variants
  // (tighter header padding, icon-only nav). Independent of `isDesktop` —
  // both queries are just matchMedia, and a tiny phone is never desktop.
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);

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
  // rendered AnnouncementBanner (via the shell chrome context) after layout so
  // the shell's offset math stays exact when text wraps to multiple lines.
  const [bannerPx, setBannerPx] = useState(BANNER_HEIGHT_PX);
  // Whether a banner is present. Derived from the (protected) layout's resolved
  // `bannerConfig` prop — known before the shell's first render, so the header
  // and route skeleton are aligned with the steady-state layout from first
  // paint. There is no pending state to guess about: a configured banner grows
  // the header in the very first SSR render (no post-hydration jump), and a
  // null config leaves the bare 56px bar (no phantom gap, nothing to collapse).
  const bannerActive = bannerConfig !== null;
  // Whether the signed-in non-admin user belongs to at least one KAH group —
  // reveals the KAH Status nav entry once the streamed probe resolves true.
  const [kahGroup, setKahGroup] = useState(false);

  const shellChrome: ShellChromeValue = useMemo(
    () => ({
      setBannerHeight: (px) => {
        if (px > 0) setBannerPx(px);
      },
      setKahGroup,
    }),
    [setBannerPx, setKahGroup],
  );

  // Desktop sidebar minimized to the icon rail, initialized from the
  // remembered state the (protected) layout read from the cookie before first
  // paint. The effect below converges the cookie on every toggle (writing
  // false too, so re-expanding is remembered).
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);
  useEffect(() => {
    writeUiState({ sidebarCollapsed: collapsed });
  }, [collapsed]);

  // Auto-collapse to the icon rail whenever the viewport enters the
  // desktop-but-not-wide band (640–799px): one-shot per band entry, so a
  // manual expand inside the band survives until the next entry (resize
  // across 800px and back, or a fresh load in the band). Above 800px or below
  // the desktop breakpoint the remembered state rules untouched.
  const inRailBand = isDesktop && !isDesktopWide;
  const wasInRailBandRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (wasInRailBandRef.current !== inRailBand && inRailBand) {
      setCollapsed(true);
    }
    wasInRailBandRef.current = inRailBand;
  }, [inRailBand]);

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
      ? [CALENDAR, PARADE_STATE, CONTACTS, DOUBLE_BOOKING, KAH_STATUS, SETTINGS]
      : kahGroup
        ? [CALENDAR, PARADE_STATE, CONTACTS, DOUBLE_BOOKING, KAH_STATUS]
        : [CALENDAR, PARADE_STATE, CONTACTS, DOUBLE_BOOKING];

  // The Double Booking nav badge: the acting user's own double-booking overlap
  // count (the same read-only scan the /double-booking page runs). Fetched
  // once on mount (background, never blocking a page load), again on tab
  // refocus, and after any event create/update/delete (debounced) via
  // `cloudy2:events-changed`. Best-effort — a failure keeps the last value;
  // `null` (not yet known) renders no pill, and a real clean scan (0) hides
  // it too, so a missing pill means "none right now".
  const [doubleBookingCount, setDoubleBookingCount] = useState<number | null>(null);
  const doubleBookingDebounceRef = useRef<number | null>(null);
  const refreshDoubleBooking = useCallback(() => {
    return checkUserClashes({})
      .then((result) => {
        if (!result.ok) {
          return;
        }
        setDoubleBookingCount(result.skipReason === null ? result.groups.length : 0);
      })
      .catch(() => {
        // Keep the last known count.
      });
  }, []);
  useEffect(() => {
    // The cold-start scan doubles as a readiness leg (see `pinned` above).
    beginLeg("clashes");
    void withTimeout(refreshDoubleBooking(), COLD_LEG_TIMEOUT_MS).finally(() =>
      settleLeg("clashes"),
    );
  }, [refreshDoubleBooking, beginLeg, settleLeg]);
  useEffect(() => {
    const schedule = () => {
      if (doubleBookingDebounceRef.current !== null) {
        window.clearTimeout(doubleBookingDebounceRef.current);
      }
      doubleBookingDebounceRef.current = window.setTimeout(() => {
        doubleBookingDebounceRef.current = null;
        void refreshDoubleBooking();
      }, 400);
    };
    const onChanged = () => schedule();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        schedule();
      }
    };
    window.addEventListener(EVENTS_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(EVENTS_CHANGED_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisible);
      if (doubleBookingDebounceRef.current !== null) {
        window.clearTimeout(doubleBookingDebounceRef.current);
      }
    };
  }, [refreshDoubleBooking]);

  // The KAH Status nav badge: the number of the viewer's groups breaching on
  // at least one day from today through the next 30 days (admins: all groups,
  // matching their status page; members: their own) — the same forward-looking
  // advisory shape as the Double Booking badge. Same best-effort lifecycle as
  // the Double Booking badge, and only fetched for users who can see the KAH
  // entry at all (`showKah`).
  const showKah = role === "admin" || kahGroup;
  const [kahCount, setKahCount] = useState<number | null>(null);
  const kahDebounceRef = useRef<number | null>(null);
  const refreshKah = useCallback(() => {
    return checkKahBreaches()
      .then((result) => {
        if (result.ok) {
          setKahCount(result.count);
        }
      })
      .catch(() => {
        // Keep the last known count.
      });
  }, []);
  useEffect(() => {
    if (!showKah) {
      return;
    }
    beginLeg("kah");
    void withTimeout(refreshKah(), COLD_LEG_TIMEOUT_MS).finally(() => settleLeg("kah"));
  }, [showKah, refreshKah, beginLeg, settleLeg]);
  useEffect(() => {
    if (!showKah) {
      return;
    }
    const schedule = () => {
      if (kahDebounceRef.current !== null) {
        window.clearTimeout(kahDebounceRef.current);
      }
      kahDebounceRef.current = window.setTimeout(() => {
        kahDebounceRef.current = null;
        void refreshKah();
      }, 400);
    };
    const onChanged = () => schedule();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        schedule();
      }
    };
    window.addEventListener(EVENTS_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(EVENTS_CHANGED_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisible);
      if (kahDebounceRef.current !== null) {
        window.clearTimeout(kahDebounceRef.current);
      }
    };
  }, [showKah, refreshKah]);

  // Attach each count to its entry (all other entries have no badge). Copying
  // keeps the module-level consts pristine across renders.
  const badgeByHref: Record<string, number | null> = {
    [DOUBLE_BOOKING.href]: doubleBookingCount,
    [KAH_STATUS.href]: showKah ? kahCount : null,
  };
  const navItems: NavItem[] = items.map((item) => {
    const count = badgeByHref[item.href];
    return count && count > 0 ? { ...item, badge: count } : item;
  });

  // --- iOS PWA viewport sync ---
  // On some iOS versions, 100dvh/vh resolves to the full screen height but the
  // actual layout viewport is shorter (excludes the top safe-area inset). This
  // causes Mantine's dvh-based sizing to overshoot, making the document
  // scrollable and pushing content under the fixed header/footer.
  // Measure the real *visual* viewport and shell chrome, feed them back as CSS
  // variables that globals.css and Mantine's stylesheets consume. Detection is
  // JS-driven (the `app-shell-standalone` class) rather than the `display-mode`
  // media query alone: on some iOS launch paths (notifications, shortcuts,
  // restored sessions) the media query misses while `navigator.standalone` is
  // true, which left the shell sized off `100dvh` and the fixed footer detached
  // from the visible bottom.
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // Only run viewport sync in standalone PWA mode — in normal browser mode
    // 100dvh already tracks the keyboard-aware dynamic viewport correctly.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!isStandalone) return;
    // The class is what gates the consuming CSS in globals.css; toggled directly
    // on the shell root (alongside the inline vars below) so detection can't
    // race a React render. React only rewrites `className` when its prop value
    // changes, so an unrelated re-render won't drop it.
    el.classList.add("app-shell-standalone");

    const sync = () => {
      // `documentElement.clientHeight` is the *layout* viewport (what
      // `position: fixed` resolves against); `visualViewport.height` is the
      // area actually on screen. iOS standalone can report them differently
      // (rotation, resume, keyboard teardown), so size the shell from the
      // visual viewport and expose the difference for the fixed footer.
      const layoutHeight = document.documentElement.clientHeight;
      const vv = window.visualViewport;
      const vh = vv?.height ?? layoutHeight;
      el.style.setProperty("--app-shell-vh", `${vh}px`);
      const bottomGap = vv ? Math.max(0, layoutHeight - vv.height - vv.offsetTop) : 0;
      el.style.setProperty("--app-shell-visual-bottom-gap", `${bottomGap}px`);

      if (!immersive) {
        const header = el.querySelector<HTMLElement>(":scope > header");
        const footer = el.querySelector<HTMLElement>(":scope > footer");
        if (header) {
          el.style.setProperty(
            "--app-shell-header-offset",
            `${header.getBoundingClientRect().height}px`,
          );
        }
        // The collapsed (desktop) footer is only translated off-screen, so its
        // measured height is still 56px. Writing that as the inline footer
        // offset would shorten the navbar by 56px (a custom property declared
        // on this element wins over Mantine's `:root { … 0px !important }` for
        // every descendant) and pad Main's bottom — the "sidebar doesn't reach
        // the bottom / huge calendar bottom padding" bug. Below lg the footer
        // genuinely occupies that space, so only measure it while mobile; on
        // desktop remove the override and let Mantine's 0px cascade apply.
        if (footer && !isDesktop) {
          el.style.setProperty(
            "--app-shell-footer-offset",
            `${footer.getBoundingClientRect().height}px`,
          );
        } else {
          el.style.removeProperty("--app-shell-footer-offset");
        }
      } else {
        el.style.removeProperty("--app-shell-header-offset");
        el.style.removeProperty("--app-shell-footer-offset");
      }
    };

    sync();
    // React to header/footer box changes (banner appearing, safe-area insets,
    // iOS chrome shifting) via a ResizeObserver instead of a perpetual poll.
    // Observing the elements' boxes covers everything the old 500ms interval
    // caught without forcing layout reads twice a second on an idle shell.
    const header = el.querySelector<HTMLElement>(":scope > header");
    const footer = el.querySelector<HTMLElement>(":scope > footer");
    const ro =
      typeof ResizeObserver === "function" ? new ResizeObserver(() => sync()) : null;
    if (ro) {
      if (header) ro.observe(header);
      if (footer) ro.observe(footer);
    }
    window.addEventListener("resize", sync);
    const onOrientation = () => setTimeout(sync, 400);
    window.addEventListener("orientationchange", onOrientation);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    // iOS also fires `scroll` on the visual viewport as the dynamic toolbars /
    // keyboard shift it; without this the fixed footer can hold a stale gap.
    vv?.addEventListener("scroll", sync);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", onOrientation);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      el.classList.remove("app-shell-standalone");
      el.style.removeProperty("--app-shell-vh");
      el.style.removeProperty("--app-shell-visual-bottom-gap");
      el.style.removeProperty("--app-shell-header-offset");
      el.style.removeProperty("--app-shell-footer-offset");
    };
  }, [immersive, isDesktop]);

  return (
    <>
      {/* Keyboard skip link: first focusable element in the app, targets the
          main content region below (visible only while focused). */}
      <a href="#main-content" className="c2-skip-link">
        Skip to content
      </a>
      {/* Warm the bottom-nav route chunks at idle so the first switch paints
          from cache (see the component for the connection gate). */}
      <NavRouteWarmer hrefs={navItems.map((item) => item.href)} />
      <ActivityProvider>
        <InactivityActivityReporter pending={inactivityPending} />
        <AppShell
          ref={rootRef}
          // `--app-banner-height` (absent by default → 0px from the class, the
          // measured height when a banner is active) feeds
          // `--app-shell-header-offset` in globals.css. Set as an inline custom
          // property on the root so the cascade can't drift between class
          // declarations. (Not the `vars` prop — in Mantine v9 that's a
          // resolver *function*, not an object.) In immersive mode the banner
          // is hidden, so we omit the variable to keep --app-banner-height at
          // its CSS default of 0px. `bannerActive` derives from the layout's
          // resolved `bannerConfig` prop, so the very first render already
          // carries the banner height — no pending reservation, no
          // post-hydration growth.
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
              ...HEADER_STYLE,
              // Column layout only when a banner is stacked on top — otherwise
              // the single Group keeps today's row rendering.
              display: bannerActive && !immersive ? "flex" : undefined,
              flexDirection: bannerActive ? "column" : undefined,
            }}
          >
            <ShellChromeContext.Provider value={shellChrome}>
              {kahNavSlot}
              {bannerConfig && !immersive ? <AnnouncementBanner config={bannerConfig} /> : null}
              <Group
                h={HEADER_HEIGHT_PX}
                justify="space-between"
                px={isNarrow ? "xs" : "md"}
                gap={isNarrow ? 4 : "md"}
                wrap="nowrap"
              >
                <PinnedEventsTicker
                  events={pinnedEvents}
                  paused={pinnedOpen}
                  onOpen={openPinnedPanel}
                  status={pinnedEvents !== null ? "ready" : pinnedStatus}
                  indicator={pinnedTickerIndicator}
                />
                <Group gap={isNarrow ? 2 : "xs"} wrap="nowrap">
                  <ActionIcon
                    ref={searchButtonRef}
                    variant="transparent"
                    c="white"
                    size="lg"
                    aria-label="Search events"
                    onPointerEnter={preloadSearchModal}
                    onFocus={preloadSearchModal}
                    onPointerDown={preloadSearchModal}
                    onTouchStart={preloadSearchModal}
                    onClick={(e) => openSearch(e.currentTarget.getBoundingClientRect())}
                  >
                    <IconSearch size={18} />
                  </ActionIcon>
                  <ActionIcon
                    variant="transparent"
                    c="white"
                    size="lg"
                    aria-label="Force refresh"
                    disabled={isDashboard && !googleConfigured}
                    onClick={handleForceRefresh}
                  >
                    <IconRefresh size={18} />
                  </ActionIcon>
                  <UserMenu name={name} role={role} phone={phone} />
                </Group>
              </Group>
              {/* Global activity bar: indeterminate amber strip pinned to the
                header's bottom edge while any route navigation, in-page
                transition, or post-mutation refresh is in flight. */}
              <ActivityBar />
              {/* Cold-start readiness: shares the activity bar's slot — amber
                while the once-per-launch client fetches settle, then a brief
                green bar confirming all data is in. ActivityBar suppresses
                itself during these phases so the two never double up. */}
              <ColdStartReadyBar />
            </ShellChromeContext.Provider>
          </AppShell.Header>

          <AppShell.Navbar
            p="md"
            style={NAVBAR_STYLE}
          >
            <Stack gap="xs">
              {navItems.map((item) =>
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
                    leftSection={
                      <PendingDim busyKey={`side:${item.href}`}>
                        <NavIcon item={item} />
                      </PendingDim>
                    }
                    aria-label={item.badge ? navAriaLabel(item) : undefined}
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
                <PinnedEventsPanel seedEvents={pinnedEvents} />
                {searchLoaded && (
                  <EventSearchModal
                    opened={searchOpen}
                    onClose={() => setSearchOpen(false)}
                    originRect={searchOriginRect}
                  />
                )}
              </PinnedPanelContext.Provider>
            </ImmersiveModeContext.Provider>
          </AppShell.Main>

          <AppShell.Footer
            style={{
              viewTransitionName: "c2-shell-footer",
              background: "var(--mantine-color-body)",
              borderTop: "1px solid var(--mantine-color-default-border)",
            }}
          >
            <Box
              style={{
                display: "flex",
              }}
            >
              {navItems.map((item) => (
                <NavButton
                  key={item.href}
                  item={item}
                  active={isActive(item)}
                  onTap={() => handleTap(item.href)}
                  compact={isNarrow}
                />
              ))}
            </Box>
          </AppShell.Footer>
        </AppShell>
      </ActivityProvider>
    </>
  );
}
