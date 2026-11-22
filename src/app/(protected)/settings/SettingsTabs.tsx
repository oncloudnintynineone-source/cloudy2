"use client";

import { Fragment, useEffect, useRef, useTransition } from "react";
import { Box, Tabs, Text, useMantineTheme } from "@mantine/core";
import { useElementSize, useMediaQuery } from "@mantine/hooks";
import { usePathname, useRouter } from "next/navigation";

import { useReportActivity } from "@/components/ActivityBar";
import { RailEdgeControl } from "@/components/RailEdgeControl";
import { BOTTOM_NAV_HEIGHT_CSS } from "@/lib/bottomNav";
import { useScrollEdges } from "@/lib/ui/scrollEdges";

/**
 * The 13 settings tabs in four discovery groups (docs/ui-ux-improvements.md
 * C1): the strip used to be a bare scroller, so Webhooks / Feature Flags /
 * Parade State Email hid off-edge with no hint. The groups read as labelled
 * separators at `lg`+; below `lg` the strip stays the same scroller (the
 * groups would eat the row's height), and both tiers get the bottom-nav
 * rail's fade + chevron edge affordance plus a scroll-into-view of the active
 * tab on entry.
 */
const SETTINGS_TAB_GROUPS = [
  {
    label: "Roster",
    tabs: [
      { value: "/settings/users", label: "Users" },
      { value: "/settings/departments", label: "Departments" },
    ],
  },
  {
    label: "Events",
    tabs: [
      { value: "/settings/event-types", label: "Event Types" },
      { value: "/settings/templates", label: "Templates" },
    ],
  },
  {
    label: "Delivery",
    tabs: [
      { value: "/settings/webhooks", label: "Webhooks" },
      { value: "/settings/quick-links", label: "Quick Links" },
      { value: "/settings/parade-email", label: "Parade State Email" },
      { value: "/settings/banner", label: "Banner" },
    ],
  },
  {
    label: "System",
    tabs: [
      { value: "/settings/kah-groups", label: "KAH Groups" },
      { value: "/settings/general", label: "General" },
      { value: "/settings/security", label: "Security" },
      { value: "/settings/audit-log", label: "Audit Log" },
      { value: "/settings/feature-flags", label: "Feature Flags" },
    ],
  },
];

const tabs = SETTINGS_TAB_GROUPS.flatMap((group) => group.tabs);

interface SettingsTabsProps {
  /**
   * Desktop sticky strip height in px (0 below `lg`). Published by
   * `SettingsShell` so list pages can dock their own sticky toolbar beneath
   * the tabs.
   */
  onHeightChange?: (height: number) => void;
}

export function SettingsTabs({ onHeightChange }: SettingsTabsProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const { ref: stickyRef, height: stickyHeight } = useElementSize();
  // The Tabs.List element is the horizontal scroller; its edges drive the
  // fade + chevron affordances (the bottom-nav rail recipe, C1).
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const edges = useScrollEdges(scrollerRef);

  useEffect(() => {
    onHeightChange?.(isDesktop ? Math.ceil(stickyHeight) : 0);
  }, [isDesktop, stickyHeight, onHeightChange]);
  // Tab flips are server route navigations; on a slow network their request
  // rides the shared activity bar while the per-segment skeleton loads.
  const [isPending, startTransition] = useTransition();
  useReportActivity(isPending, "settings:tab");

  const active = tabs.some((tab) => tab.value === pathname) ? pathname : "/settings/users";

  // The active tab can sit off-edge on entry (a deep link, or a reload on
  // Audit Log) — centre it in the scroller so the strip never opens on a
  // blank-looking page with the current tab hidden.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const tab = scroller.querySelector<HTMLElement>(`[data-settings-tab="${active}"]`);
    if (!tab) {
      return;
    }
    const target = tab.offsetLeft - (scroller.clientWidth - tab.clientWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, target) });
  }, [active, isDesktop, scrollerRef]);

  const tabsEl = (
    <Box
      // Below `lg` this wrapper is the fixed bar (the edge controls anchor to
      // it and the Tabs.List scrolls inside); at `lg`+ it is the relative box
      // the edge controls sit over.
      className={isDesktop ? undefined : "c2-glass-surface"}
      style={
        isDesktop
          ? { position: "relative" }
          : {
              viewTransitionName: "c2-settings-tabs",
              position: "fixed",
              bottom: BOTTOM_NAV_HEIGHT_CSS,
              left: 0,
              right: 0,
              zIndex: 10,
              borderTop: "1px solid var(--mantine-color-default-border)",
            }
      }
    >
      <Tabs
        className="c2-settings-tabs"
        value={active}
        onChange={(value) => {
          if (value) {
            startTransition(() => router.push(value));
          }
        }}
      >
        <Tabs.List
          ref={scrollerRef}
          style={{
            flexWrap: "nowrap",
            overflowX: "auto",
          }}
        >
          {SETTINGS_TAB_GROUPS.map((group, index) => (
            <Fragment key={group.label}>
              {/* Group separator (C1) at `lg`+ only — below `lg` the row is
                  too short to carry labels without growing the measured
                  chrome height. aria-hidden: the tab names stay the
                  accessible structure; the separator is a visual aid. */}
              {isDesktop && index > 0 && (
                <Box
                  aria-hidden
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--mantine-spacing-xs)",
                    paddingInline: "var(--mantine-spacing-xs)",
                    flexShrink: 0,
                    alignSelf: "stretch",
                  }}
                >
                  <Box
                    style={{
                      width: 1,
                      alignSelf: "stretch",
                      marginBlock: "var(--mantine-spacing-xs)",
                      background: "var(--mantine-color-default-border)",
                    }}
                  />
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" lh={1}>
                    {group.label}
                  </Text>
                </Box>
              )}
              {group.tabs.map((tab) => (
                <Tabs.Tab
                  key={tab.value}
                  value={tab.value}
                  // Own hook for the scroll-into-view query above (Mantine's
                  // TabsTab spreads unknown props to the DOM but carries no
                  // `data-value` of its own).
                  data-settings-tab={tab.value}
                  style={
                    isDesktop
                      ? undefined
                      : {
                          minHeight:
                            "calc((var(--mantine-spacing-xs) + var(--mantine-font-size-sm) + var(--mantine-spacing-xs)) * 1.5)",
                        }
                  }
                >
                  {tab.label}
                </Tabs.Tab>
              ))}
            </Fragment>
          ))}
        </Tabs.List>
      </Tabs>
      <RailEdgeControl side="left" hidden={edges.atStart} />
      <RailEdgeControl side="right" hidden={edges.atEnd} hint />
    </Box>
  );

  if (!isDesktop) {
    return tabsEl;
  }

  // Sticky top row under the app header. The sticky element must be a direct
  // child of the page column (the settings layout root) — pinned to the Tabs
  // root alone it couldn't stick: that root is only as tall as the tab bar
  // and scrolls away with the page (same pattern as the dashboard's
  // view-tabs wrapper).
  return (
    <Box
      ref={stickyRef}
      className="c2-glass-surface"
      style={{
        viewTransitionName: "c2-settings-tabs",
        position: "sticky",
        top: "var(--app-shell-header-offset)",
        zIndex: 9,
        borderBottom: "1px solid var(--mantine-color-default-border)",
        marginBottom: "var(--mantine-spacing-md)",
      }}
    >
      {tabsEl}
    </Box>
  );
}
