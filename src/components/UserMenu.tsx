"use client";

import { ActionIcon, Menu } from "@mantine/core";
import { IconLogout, IconUser } from "@tabler/icons-react";
import { signOut } from "next-auth/react";

export function UserMenu({ name }: { name: string }) {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="transparent" c="white" size="lg" aria-label="Profile">
          <IconUser size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{name}</Menu.Label>
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
