"use client";

import { AppShell, Group, Text, UnstyledButton } from "@mantine/core";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBuilding,
  IconLayoutDashboard,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";

interface NavItem {
  label: string;
  href: string;
  icon: Icon;
}

const navItems = (role: "admin" | "user"): NavItem[] =>
  role === "admin"
    ? [
        { label: "Dashboard", href: "/dashboard", icon: IconLayoutDashboard },
        { label: "Users", href: "/users", icon: IconUsers },
        { label: "Departments", href: "/departments", icon: IconBuilding },
      ]
    : [{ label: "Dashboard", href: "/dashboard", icon: IconLayoutDashboard }];

export function AppShellShell({
  role,
  children,
}: {
  role: "admin" | "user";
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AppShell header={{ height: 56 }} footer={{ height: 64 }} padding="md">
      <AppShell.Header>
        <Group h="100%" justify="center">
          <Text fw={700} size="lg">
            Cloudy
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Footer>
        <Group
          h="100%"
          gap={0}
          grow
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {navItems(role).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <UnstyledButton
                key={item.href}
                component={Link}
                href={item.href}
                h="100%"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  color: active
                    ? "var(--mantine-primary-color-filled)"
                    : "var(--mantine-color-dimmed)",
                }}
              >
                <Icon size={22} stroke={active ? 2.5 : 2} />
                <Text size="xs" fw={active ? 700 : 500}>
                  {item.label}
                </Text>
              </UnstyledButton>
            );
          })}
        </Group>
      </AppShell.Footer>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
