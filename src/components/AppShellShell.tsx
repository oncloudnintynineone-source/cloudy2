"use client";

import { AppShell, Box, Group, Text, UnstyledButton } from "@mantine/core";
import {
  IconAddressBook,
  IconCalendarMonth,
  IconClipboardList,
  IconSettings,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { BOTTOM_NAV_HEIGHT, BOTTOM_NAV_HEIGHT_CSS } from "@/lib/bottomNav";

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
        color: active
          ? "var(--mantine-color-brand-7)"
          : "light-dark(var(--mantine-color-gray-6), var(--mantine-color-dark-1))",
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
  children,
}: {
  role: "admin" | "user";
  name: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const items: NavItem[] =
    role === "admin" ? [CALENDAR, PARADE_STATE, CONTACTS, SETTINGS] : [CALENDAR, PARADE_STATE, CONTACTS];

  return (
    <AppShell header={{ height: 56 }} footer={{ height: BOTTOM_NAV_HEIGHT_CSS }} padding="md">
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
