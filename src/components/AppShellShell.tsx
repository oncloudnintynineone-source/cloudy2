"use client";

import {
  AppShell,
  Box,
  Group,
  NavLink,
  Stack,
  Text,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
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
import { useRememberedPage } from "@/lib/ui/uiStateClient";

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
  // Remember the last visited page (incl. the /settings sub-tab) so a PWA
  // relaunch from the start URL can land back here — read by / at launch.
  useRememberedPage(pathname);

  const theme = useMantineTheme();
  // Desktop = the theme's lg breakpoint: the bottom nav collapses and a left
  // sidebar takes over navigation (AppShell navbar, hidden below the
  // breakpoint). Both read the same theme value so they can't drift.
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);

  const items: NavItem[] =
    role === "admin"
      ? [CALENDAR, PARADE_STATE, CONTACTS, SETTINGS]
      : [CALENDAR, PARADE_STATE, CONTACTS];

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: "lg", collapsed: { mobile: true } }}
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
        }}
      >
        <Stack gap="xs">
          {items.map((item) => (
            <NavLink
              key={item.href}
              component={Link}
              href={item.href}
              label={item.label}
              leftSection={item.icon}
              active={item.matches(pathname)}
            />
          ))}
        </Stack>
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
