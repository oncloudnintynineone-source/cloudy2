"use client";

import { Badge, UnstyledButton } from "@mantine/core";

export interface SelectableBadgeProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  /** Marks the signed-in user with the amber "mine" treatment and a "(You)" suffix. */
  self?: boolean;
  /** Overrides the default accessible name ("<label>, selected"). */
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * The app's one selectable badge: an `UnstyledButton` wrapping a Badge so the
 * control is keyboard-operable and announces its pressed state. Matches the
 * wizard's event-type badges and the user picker's option badges, and is shared
 * by those surfaces and the filter dialog so they can't drift apart.
 */
export function SelectableBadge({
  label,
  selected,
  onToggle,
  self = false,
  ariaLabel,
  disabled = false,
}: SelectableBadgeProps) {
  return (
    <UnstyledButton
      aria-pressed={selected}
      aria-label={
        ariaLabel ?? `${self ? `${label} (You)` : label}${selected ? ", selected" : ""}`
      }
      disabled={disabled}
      onClick={onToggle}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : undefined,
        borderRadius: "var(--mantine-radius-md)",
        maxWidth: "100%",
      }}
    >
      <Badge
        variant={selected ? "filled" : "light"}
        size="lg"
        className={self ? "c2-my-badge" : undefined}
        style={{
          height: "auto",
          minHeight: "calc(var(--badge-height-lg) * 1.5)",
          paddingBlock: 4,
          maxWidth: "100%",
        }}
        styles={{
          label: {
            whiteSpace: "normal",
            lineHeight: 1.25,
            textAlign: "center",
            overflow: "visible",
            textOverflow: "clip",
          },
        }}
      >
        {self ? `${label} (You)` : label}
      </Badge>
    </UnstyledButton>
  );
}
