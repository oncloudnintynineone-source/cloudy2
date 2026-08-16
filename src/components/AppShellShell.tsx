"use client";

import { AppShell, Group, Text } from "@mantine/core";
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
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" justify="space-between" px="md">
          <Text fw={700} size="lg" component={Link} href="/dashboard" td="none">
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
