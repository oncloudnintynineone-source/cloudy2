"use client";

import { Box, Group, Menu, Text, useMantineTheme } from "@mantine/core";
import { IconLink } from "@tabler/icons-react";

import { QuickLinkIcon } from "./QuickLinkIcon";

export interface QuickLinkMenuItem {
  id: string;
  label: string;
  url: string;
  icon: string;
  color: string | null;
}

interface QuickLinksMenuProps {
  links: QuickLinkMenuItem[];
  /**
   * The menu trigger as a single element (the amber Quick-links FAB on
   * mobile, the labelled chip in the desktop nav row). Menu.Target clones it
   * to attach its click handler and ref.
   */
  trigger: React.ReactNode;
  /** Menu position relative to the trigger: above the FAB, below the nav row. */
  position: "top-end" | "bottom-end";
}

/**
 * The dashboard's quick-links menu. Deliberately distinct from the grey
 * "More options" kebab: a branded amber header band identifies it at a
 * glance. Selecting an item opens its URL in a new tab.
 */
export function QuickLinksMenu({ links, trigger, position }: QuickLinksMenuProps) {
  const theme = useMantineTheme();
  return (
    <Menu shadow="md" width={280} position={position}>
      <Menu.Target>{trigger}</Menu.Target>
      <Menu.Dropdown styles={{ dropdown: { padding: 4, paddingTop: 0 } }}>
        <Box
          role="heading"
          aria-level={2}
          style={{
            background: theme.colors.accent[0],
            color: theme.colors.accent[8],
            borderRadius: `${theme.radius.sm} ${theme.radius.sm} 0 0`,
            padding: "8px 12px 6px",
          }}
        >
          <Group gap={6} align="center">
            <IconLink size={16} stroke={2.5} />
            <Text size="sm" fw={600} tt="none">
              Quick links
            </Text>
          </Group>
        </Box>
        {links.map((link) => {
          const palette = link.color ? theme.colors[link.color] : undefined;
          return (
            <Menu.Item
              key={link.id}
              leftSection={
                <QuickLinkIcon iconKey={link.icon} size={18} color={palette?.[8]} />
              }
              onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
            >
              {link.label}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
