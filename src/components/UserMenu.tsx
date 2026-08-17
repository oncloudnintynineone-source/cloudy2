"use client";

import { ActionIcon, Menu } from "@mantine/core";
import { IconLogout, IconSettings, IconUser } from "@tabler/icons-react";
import { signOut } from "next-auth/react";
import Link from "next/link";

export function UserMenu({ name, role }: { name: string; role: "admin" | "user" }) {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="transparent" c="white" size="lg" aria-label="Profile">
          <IconUser size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{name}</Menu.Label>
        {role === "admin" && (
          <Menu.Item
            leftSection={<IconSettings size={16} />}
            component={Link}
            href="/settings"
          >
            Admin Settings
          </Menu.Item>
        )}
        <Menu.Item
          leftSection={<IconLogout size={16} />}
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
