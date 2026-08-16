"use client";

import { AppShell, Burger, Group, NavLink, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = (role: "admin" | "user") =>
  role === "admin"
    ? [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Roster", href: "/roster" },
        { label: "Departments", href: "/departments" },
      ]
    : [{ label: "Dashboard", href: "/dashboard" }];

export function AppShellShell({
  role,
  children,
}: {
  role: "admin" | "user";
  children: React.ReactNode;
}) {
  const [opened, { toggle }] = useDisclosure();
  const pathname = usePathname();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Title order={3}>Cloudy</Title>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        {navItems(role).map((item) => (
          <NavLink
            key={item.href}
            component={Link}
            href={item.href}
            label={item.label}
            active={pathname === item.href}
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
