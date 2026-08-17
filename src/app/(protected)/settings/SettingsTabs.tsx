"use client";

import { Tabs } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";

const tabs = [
  { value: "/settings/users", label: "Users" },
  { value: "/settings/departments", label: "Departments" },
  { value: "/settings/event-types", label: "Event Types" },
  { value: "/settings/templates", label: "Templates" },
  { value: "/settings/general", label: "General" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const router = useRouter();

  const active = tabs.some((tab) => tab.value === pathname) ? pathname : "/settings/users";

  return (
    <Tabs
      value={active}
      onChange={(value) => {
        if (value) {
          router.push(value);
        }
      }}
    >
      <Tabs.List
        style={{
          flexWrap: "nowrap",
          overflowX: "auto",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          background: "var(--mantine-color-body)",
          borderTop: "1px solid var(--mantine-color-default-border)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            style={{
              minHeight:
                "calc((var(--mantine-spacing-xs) + var(--mantine-font-size-sm) + var(--mantine-spacing-xs)) * 1.5)",
            }}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
