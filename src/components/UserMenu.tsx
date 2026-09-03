"use client";

import { ActionIcon, Menu } from "@mantine/core";
import { IconLogout, IconUser } from "@tabler/icons-react";
import { signOut } from "next-auth/react";

import { MOTION } from "@/lib/motion/timing";
import { clearAllSavedPages } from "@/lib/pwa/client";
import { clearUiState } from "@/lib/ui/uiStateClient";

export function UserMenu({ name }: { name: string }) {
  return (
    <Menu
      shadow="md"
      width={200}
      position="bottom-end"
      withinPortal
      transitionProps={{
        transition: "pop-top-right",
        duration: MOTION.popover,
        timingFunction: "ease",
      }}
    >
      <Menu.Target>
        <ActionIcon variant="transparent" c="white" size="lg" aria-label="Profile">
          <IconUser size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{name}</Menu.Label>
        <Menu.Item
          leftSection={<IconLogout size={16} />}
          onClick={() => {
            // The remembered-state cookie is per-device: drop it on sign-out so
            // the next account on this device starts from the defaults.
            clearUiState();
            void clearAllSavedPages();
            signOut({ callbackUrl: "/login" });
          }}
        >
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
