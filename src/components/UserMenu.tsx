"use client";

import { useState } from "react";
import { ActionIcon, Menu, Stack, Text } from "@mantine/core";
import { IconCalendarPlus, IconLogout, IconUser } from "@tabler/icons-react";
import { signOut } from "next-auth/react";

import { MOTION } from "@/lib/motion/timing";
import { clearAllSavedPages } from "@/lib/pwa/client";
import { clearUiState } from "@/lib/ui/uiStateClient";

import { CalendarAccessModal } from "./CalendarAccessModal";

interface UserMenuProps {
  /** The user's full display name. */
  name: string;
  role: "admin" | "user";
  phone: string | null;
}

export function UserMenu({ name, role, phone }: UserMenuProps) {
  const [accessOpen, setAccessOpen] = useState(false);
  const roleLabel = role === "admin" ? "Admin" : "User";
  const subtitle = [roleLabel, phone].filter(Boolean).join(" · ");

  return (
    <>
      <Menu
        shadow="md"
        width={240}
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
          {/* Profile header: full display name, never truncated. */}
          <Stack gap={0} px="md" py="sm">
            <Text size="sm" fw={700}>
              {name}
            </Text>
            {subtitle && (
              <Text size="xs" c="dimmed">
                {subtitle}
              </Text>
            )}
          </Stack>
          <Menu.Divider />
          <Menu.Item
            leftSection={<IconCalendarPlus size={16} />}
            onClick={() => setAccessOpen(true)}
          >
            Calendar Access
          </Menu.Item>
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
      <CalendarAccessModal opened={accessOpen} onClose={() => setAccessOpen(false)} />
    </>
  );
}
