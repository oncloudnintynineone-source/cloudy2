"use client";

import { type MouseEvent, type ReactNode, type RefObject, useRef } from "react";
import { ActionIcon, Affix, Box, Button, Group, TextInput } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

import { FilterButton } from "@/components/FilterButton";
import { useChromeHide } from "@/lib/ui/chromeHide";
import { useKeyboardInset } from "@/lib/ui/keyboardInset";
import { DESKTOP_MEDIA_QUERY } from "@/lib/theme";

export interface SettingsListAction {
  /** Button label (desktop) and accessible name (mobile circle). */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Brand-solid circle in the mobile pill and a filled button on desktop. */
  primary?: boolean;
}

interface SettingsListChromeProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  filter?: {
    activeCount: number;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
  actions: SettingsListAction[];
  /** Page content pane; drives the mobile pill's hide-on-interaction. */
  paneRef: RefObject<HTMLElement | null>;
}

/**
 * Search/action chrome shared by the settings list pages (Users, Departments,
 * Event Types) — the Contacts list recipe:
 *
 * - `lg`+: a frosted sticky bar docked just below the sticky settings tab
 *   strip (`--c2-settings-tabs-height`, published by `SettingsShell`).
 * - below `lg`: the floating bottom control pill (search field + optional
 *   filter + action circles), lifted above the OS keyboard and auto-hidden
 *   while the page content is touched/scrolled.
 *
 * The create/manage actions live in the chrome on both breakpoints; the pages
 * no longer render a separate mobile FAB.
 */
export function SettingsListChrome({
  search,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  filter,
  actions,
  paneRef,
}: SettingsListChromeProps) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const keyboardInset = useKeyboardInset();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const chromeHidden = useChromeHide({ enabled: !isDesktop, paneRef });

  return (
    <>
      {isDesktop && (
        <Box
          className="c2-glass-surface"
          style={{
            position: "sticky",
            top: "calc(var(--app-shell-header-offset) + var(--c2-settings-tabs-height, 0px))",
            zIndex: 8,
            borderBottom: "1px solid var(--mantine-color-default-border)",
            paddingBlock: "var(--mantine-spacing-md)",
          }}
        >
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <TextInput
              aria-label={searchAriaLabel}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              style={{ flex: 1 }}
            />
            {filter && (
              <FilterButton activeCount={filter.activeCount} onClick={filter.onClick} />
            )}
            {actions.map((action) => (
              <Button
                key={action.label}
                __vars={{ "--button-height": "43px" }}
                variant={action.primary ? "filled" : "default"}
                leftSection={action.icon}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </Group>
        </Box>
      )}

      <Affix
        hiddenFrom="lg"
        className="c2-pill-lift"
        position={{
          bottom:
            keyboardInset > 0
              ? `calc(${keyboardInset}px + 16px)`
              : "var(--settings-fab-bottom)",
          left: 16,
          right: 16,
        }}
        zIndex={100}
      >
        <Box
          className={`c2-glass-surface c2-control-pill c2-chrome-hide-able${
            chromeHidden ? " c2-chrome-hidden" : ""
          }`}
        >
          <Group align="center" gap="xs" wrap="nowrap">
            <TextInput
              ref={searchInputRef}
              radius="999px"
              aria-label={searchAriaLabel}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            {filter && (
              <FilterButton
                activeCount={filter.activeCount}
                onClick={(event) => {
                  searchInputRef.current?.blur();
                  filter.onClick(event);
                }}
                size={44}
                iconSize={20}
                radius="50%"
                className="c2-glass-btn"
              />
            )}
            {actions.map((action) => (
              <ActionIcon
                key={action.label}
                size={44}
                radius="50%"
                variant="default"
                className={`c2-glass-btn${action.primary ? " c2-glass-fab--brand" : ""}`}
                aria-label={action.label}
                onClick={() => {
                  searchInputRef.current?.blur();
                  action.onClick();
                }}
              >
                {action.icon}
              </ActionIcon>
            ))}
          </Group>
        </Box>
      </Affix>
    </>
  );
}
