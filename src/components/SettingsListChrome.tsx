"use client";

import { type MouseEvent, type ReactNode, type Ref, useRef } from "react";
import { ActionIcon, Affix, Box, Button, Group, TextInput } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

import { ControlPill } from "@/components/ControlPill";
import { FilterButton } from "@/components/FilterButton";
import { PILL_CIRCLE } from "@/lib/ui/controlPill";
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
  /**
   * Ref for measuring the mobile pill's height. The page publishes it as
   * `--c2-settings-pill-height` on its `.settings-pill-page-pad` column, because
   * the pill's control strip wraps to a second row on narrow phones and the page
   * pad has to clear the whole box.
   */
  pillRef?: Ref<HTMLDivElement>;
}

/**
 * Search/action chrome shared by the settings list pages (Users, Departments,
 * Event Types) — the Contacts list recipe:
 *
 * - `lg`+: a frosted sticky bar docked just below the sticky settings tab
 *   strip (`--c2-settings-tabs-height`, published by `SettingsShell`).
 * - below `lg`: the floating bottom control pill (search field + optional
 *   filter + action circles), lifted above the OS keyboard. The shared
 *   `ControlPill` layout keeps the field at a usable width and lets the circles
 *   pan in their own strip — three 44px circles plus a search box do not fit a
 *   320px phone, so they wrap to a second row instead of squeezing the field.
 *   The pill never hides on scroll (only the calendar page does that).
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
  pillRef,
}: SettingsListChromeProps) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const keyboardInset = useKeyboardInset();
  const searchInputRef = useRef<HTMLInputElement>(null);

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
        <ControlPill
          pillRef={pillRef}
          actionsLabel="List controls"
          circleSize={PILL_CIRCLE.list}
          minActions={Math.min(3, actions.length + (filter ? 1 : 0))}
          leading={
            <TextInput
              ref={searchInputRef}
              className="c2-pill-field"
              radius="999px"
              aria-label={searchAriaLabel}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
            />
          }
          actions={
            <>
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
            </>
          }
        />
      </Affix>
    </>
  );
}
