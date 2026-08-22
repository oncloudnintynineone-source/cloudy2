"use client";

import { Box, Tabs, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { usePathname, useRouter } from "next/navigation";

import { BOTTOM_NAV_HEIGHT_CSS } from "@/lib/bottomNav";

const tabs = [
  { value: "/settings/users", label: "Users" },
  { value: "/settings/departments", label: "Departments" },
  { value: "/settings/event-types", label: "Event Types" },
  { value: "/settings/templates", label: "Templates" },
  { value: "/settings/general", label: "General" },
  { value: "/settings/audit-log", label: "Audit Log" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);

  const active = tabs.some((tab) => tab.value === pathname) ? pathname : "/settings/users";

  const tabsEl = (
    <Tabs
      value={active}
      onChange={(value) => {
        if (value) {
          router.push(value);
        }
      }}
    >
      <Tabs.List
        style={
          isDesktop
            ? {
                flexWrap: "nowrap",
                overflowX: "auto",
              }
            : {
                flexWrap: "nowrap",
                overflowX: "auto",
                position: "fixed",
                bottom: BOTTOM_NAV_HEIGHT_CSS,
                left: 0,
                right: 0,
                zIndex: 10,
                background: "var(--mantine-color-body)",
                borderTop: "1px solid var(--mantine-color-default-border)",
              }
        }
      >
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
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
      </Tabs.List>
    </Tabs>
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
      style={{
        position: "sticky",
        top: "var(--app-shell-header-offset)",
        zIndex: 9,
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
        marginBottom: "var(--mantine-spacing-md)",
      }}
    >
      {tabsEl}
    </Box>
  );
}
