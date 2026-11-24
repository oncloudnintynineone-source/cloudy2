"use client";

import { Menu, useMantineTheme } from "@mantine/core";

import { useMotion } from "@/components/MotionProvider";
import type { QuickLinkMenuItem } from "@/lib/quickLinks/types";
import { EXTERNAL_LINK_PROPS } from "@/lib/ui/externalLink";

import { QuickLinkIcon } from "./QuickLinkIcon";

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
 * "More options" kebab: an amber trigger and larger, page-scale rows.
 * Selecting an item opens its URL in a new tab through a real anchor
 * (`EXTERNAL_LINK_PROPS`), so middle-click, Ctrl-click and the browser's own
 * "open in new tab" work like any other link.
 */
export function QuickLinksMenu({ links, trigger, position }: QuickLinksMenuProps) {
  const theme = useMantineTheme();
  const motion = useMotion();
  return (
    <Menu
      shadow="md"
      width={280}
      position={position}
      transitionProps={{
        transition: position === "top-end" ? "pop-bottom-right" : "pop-top-right",
        duration: motion.duration.popover,
        timingFunction: motion.easing.out,
      }}
      styles={{ item: { padding: "10px 12px", fontSize: "var(--mantine-font-size-md)" } }}
    >
      <Menu.Target>{trigger}</Menu.Target>
      <Menu.Dropdown>
        {links.map((link) => {
          const palette = link.color ? theme.colors[link.color] : undefined;
          return (
            <Menu.Item
              key={link.id}
              component="a"
              href={link.url}
              {...EXTERNAL_LINK_PROPS}
              leftSection={<QuickLinkIcon iconKey={link.icon} size={20} color={palette?.[8]} />}
            >
              {link.label}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
