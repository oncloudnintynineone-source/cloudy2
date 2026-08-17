"use client";

import { AppShell, Group, Text, useMantineColorScheme } from "@mantine/core";
import Link from "next/link";

import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

export function AppShellShell({
  role,
  name,
  children,
}: {
  role: "admin" | "user";
  name: string;
  children: React.ReactNode;
}) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header
        style={{
          background: isDark
            ? "var(--mantine-color-brand-9)"
            : "var(--mantine-color-brand-7)",
          borderColor: isDark
            ? "var(--mantine-color-brand-8)"
            : "var(--mantine-color-brand-8)",
        }}
      >
        <Group h="100%" justify="space-between" px="md">
          <Text fw={700} size="lg" component={Link} href="/dashboard" td="none" c="white">
            Cloudy
          </Text>
          <Group gap="xs">
            <ThemeToggle />
            <UserMenu name={name} role={role} />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
