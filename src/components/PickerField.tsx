"use client";

import type { ReactNode } from "react";
import { ActionIcon, Badge, Button, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconPencil, IconPlus, IconX } from "@tabler/icons-react";

import { pickerTriggerLabel } from "@/lib/ui/picker";

/** One resolved summary badge: the caller maps its own id domain to these. */
export interface PickerBadgeItem {
  key: string;
  label: string;
  /** Mantine color name (e.g. "brand"/"accent"); undefined = default badge color. */
  color?: string;
  /**
   * True when this badge names the signed-in user: it renders as the amber
   * "mine" badge (ring + cream tint + "(You)" suffix) and ignores `color`.
   */
  self?: boolean;
  /**
   * Screen-reader-only suffix naming what the chip *is* when the label alone
   * cannot say so — e.g. "department" on a chip inside a row that mixes people
   * and departments, where the tint is the only visual difference.
   */
  srSuffix?: string;
}

/**
 * Label case of a chip. Mantine badges are uppercase, which reads well on people
 * and department names; free-text values (search terms, dates, action labels)
 * pass `"none"` so they stay readable.
 */
export type PickerChipTextCase = "uppercase" | "none";

/**
 * Chip size — **size means affordance**:
 * - `"chip"` (default) is the interactive 36 px chip every tappable/removable
 *   pill rides, so picker rows line up with the dialog pool and the filter
 *   summaries everywhere.
 * - `"compact"` drops the chip box for the plain `Badge` metrics (≈20 px) —
 *   for **read-only** rows (the event detail modal's participant list), where
 *   the pill is information to read, not a target to hit, and must not tower
 *   over the event-type pill beside it. A compact chip never carries the ✕.
 */
export type PickerChipSize = "chip" | "compact";

/**
 * The chip box every chip in the app rides: the shared interactive-chip height
 * (`--c2-chip-height`, `globals.css`) so picker rows line up with the dialog pool
 * and the filter summaries everywhere, with `height: auto` so a long or
 * multi-line label grows the chip instead of clipping.
 */
const CHIP_ROOT_STYLES = {
  minHeight: "var(--c2-chip-height)",
  height: "auto",
  paddingBlock: 4,
} as const;

/** Compact chips take Mantine's own badge metrics — nothing to override. */
const PLAIN_ROOT_STYLES = {} as const;

/** Resolve the chip box for a size. */
function chipRootStyles(size: PickerChipSize | undefined) {
  return size === "compact" ? PLAIN_ROOT_STYLES : CHIP_ROOT_STYLES;
}

export interface PickerChipProps {
  label: string;
  /** Mantine color name (e.g. "brand"/"accent"); undefined = default badge color. */
  color?: string;
  /** Renders the amber "mine" treatment (ring + cream tint + "(You)" suffix). */
  self?: boolean;
  /** Renders the ✕ **inside** the chip that removes it. */
  onRemove?: () => void;
  /** Overrides the ✕'s accessible name (default `Remove <label>`). */
  removeLabel?: string;
  /** Label case; default Mantine uppercase (see `PickerChipTextCase`). */
  tt?: PickerChipTextCase;
  /**
   * Makes the label tappable (tap = act) while the ✕ stays a separate control —
   * for chips naming something the user can re-open, like a recent search.
   */
  onSelect?: () => void;
  /** Accessible name of the tappable label (default the label itself). */
  selectLabel?: string;
  /** Chip size; default `"chip"` (see `PickerChipSize`). */
  size?: PickerChipSize;
  /** Screen-reader-only suffix naming what the chip is (see `PickerBadgeItem`). */
  srSuffix?: string;
}

/**
 * The app's one removable chip — the recipe every removable pill rides: the
 * wizard's participant chips, the filter dialog's summaries, the event search's
 * recent searches and the audit log's applied filters. A `variant="light"` Badge
 * on the shared `--c2-chip-height` with the ✕ **inside** the chip's right
 * section — a ≥22px `ActionIcon` (`.c2-picker-chip-remove`, `globals.css`) named
 * `Remove <label>` — so a removal affordance is never painted outside the thing
 * it removes (docs/user-picker.md §1.7).
 *
 * The chip is inert unless `onSelect` is given. Then the label becomes an
 * `UnstyledButton` and the ✕ stays its **sibling**: the Badge root is a `div`,
 * so the two controls sit side by side rather than one nested in another.
 * `size="compact"` drops the interactive chip box for plain badge metrics —
 * read-only rows only (see `PickerChipSize`).
 */
export function PickerChip({
  label,
  color,
  self = false,
  onRemove,
  removeLabel,
  tt,
  onSelect,
  selectLabel,
  size,
  srSuffix,
}: PickerChipProps) {
  const text = self ? `${label} (You)` : label;
  const removeName = removeLabel ?? `Remove ${text}`;
  const base = chipRootStyles(size);
  const content = (
    <>
      {text}
      {srSuffix ? <span className="c2-sr-only">{` ${srSuffix}`}</span> : null}
    </>
  );
  return (
    <Badge
      variant="light"
      color={self ? undefined : color}
      className={self ? "c2-my-badge" : undefined}
      styles={{
        root: tt === "none" ? { ...base, textTransform: "none" } : base,
      }}
      rightSection={
        onRemove ? (
          <ActionIcon
            // The chip is not itself a control; only the ✕ (or an `onSelect`
            // label) acts.
            className="c2-picker-chip-remove"
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={removeName}
            title={removeName}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          >
            <IconX size={14} />
          </ActionIcon>
        ) : undefined
      }
    >
      {onSelect ? (
        <UnstyledButton
          // Sibling of the ✕, never its parent — the Badge root stays a `div`.
          aria-label={selectLabel ?? text}
          title={selectLabel ?? text}
          onClick={onSelect}
          style={{ cursor: "pointer", display: "block", maxWidth: "100%" }}
        >
          {content}
        </UnstyledButton>
      ) : (
        content
      )}
    </Badge>
  );
}

export interface PickerBadgesProps {
  items: PickerBadgeItem[];
  /** Max badges rendered before a "+N" overflow badge; default: no cap. */
  cap?: number;
  /** Shown in place of the badges when items is empty. */
  empty?: ReactNode;
  /**
   * Renders a ✕ on every visible chip that removes that pick **in place** — the
   * one-tap removal users look for before they ever think of reopening the
   * dialog. The `+N` overflow badge stays inert (its hidden picks are removed
   * inside the dialog, where they are named).
   */
  onRemove?: (item: PickerBadgeItem) => void;
  /** Overrides the remove control's accessible name (default `Remove <label>`). */
  removeLabel?: (item: PickerBadgeItem) => string;
  /** Label case of every chip; default Mantine uppercase (see `PickerChip`). */
  tt?: PickerChipTextCase;
  /** Size of every chip (and the `+N`); default `"chip"` (see `PickerChipSize`). */
  size?: PickerChipSize;
}

/**
 * The summary layer shared by every UserSelectModal consumer: a wrapped row of
 * `PickerChip`s for the currently picked options, with an optional overflow cap,
 * an empty-state placeholder and an optional per-chip remove control. Purely
 * presentational — opening the dialog is the caller's job (each caller owns its
 * modal + confirm wiring).
 */
export function PickerBadges({
  items,
  cap,
  empty,
  onRemove,
  removeLabel,
  tt,
  size,
}: PickerBadgesProps) {
  if (items.length === 0) {
    return empty ?? null;
  }
  const visible = cap === undefined ? items : items.slice(0, cap);
  const overflow = items.length - visible.length;
  const base = chipRootStyles(size);
  return (
    <Group gap={6} wrap="wrap">
      {visible.map((item) => (
        <PickerChip
          key={item.key}
          label={item.label}
          color={item.color}
          self={item.self}
          tt={tt}
          size={size}
          srSuffix={item.srSuffix}
          onRemove={onRemove ? () => onRemove(item) : undefined}
          removeLabel={removeLabel?.(item)}
        />
      ))}
      {overflow > 0 && (
        <Badge variant="light" styles={{ root: base }}>
          +{overflow}
        </Badge>
      )}
    </Group>
  );
}

export interface PickerTriggerProps {
  /** How many options are already picked — decides Add vs Edit wording. */
  count: number;
  /** Opens the caller's UserSelectModal. */
  onOpen: () => void;
  /** Explicit label; wins over the state-dependent Add/Edit pair. */
  triggerLabel?: string;
  /** Label while nothing is picked (default "Add"). */
  addLabel?: string;
  /** Label once something is picked (default "Edit"). */
  editLabel?: string;
}

/**
 * The picker's trigger button, shared by `PickerField` and the filter dialog's
 * search groups so the two can never drift: it says **Add** with a `+` while
 * nothing is picked and **Edit** with a pencil afterwards. A trigger that keeps
 * reading "Select +" after people are already tagged is exactly what made users
 * believe the dialog could only add (docs/user-picker.md §1.7).
 */
export function PickerTrigger({
  count,
  onOpen,
  triggerLabel,
  addLabel,
  editLabel,
}: PickerTriggerProps) {
  const picked = count > 0;
  return (
    <Button
      type="button"
      size="xs"
      variant="light"
      leftSection={picked ? <IconPencil size={14} /> : <IconPlus size={14} />}
      onClick={onOpen}
    >
      {triggerLabel ?? pickerTriggerLabel(count, { addLabel, editLabel })}
    </Button>
  );
}

export interface PickerFieldProps extends PickerBadgesProps {
  /** Omit to render the trigger + summary without a header row. */
  label?: ReactNode;
  /** Appended to the label as "(N)"; also drives the trigger's Add/Edit state. */
  count?: number;
  /** Dimmed hint under the header row (e.g. what tagging a person means). */
  description?: ReactNode;
  /** Explicit trigger label; wins over the Add/Edit pair. */
  triggerLabel?: string;
  /** Label while nothing is picked (default "Add"). */
  addLabel?: string;
  /** Label once something is picked (default "Edit"). */
  editLabel?: string;
  /** Opens the caller's UserSelectModal. */
  onOpen: () => void;
}

/**
 * A labelled user/department picker row: an optional header (label + count +
 * description) with the state-dependent `PickerTrigger` pinned right, then the
 * `PickerBadges` summary. Shared by the event wizard's
 * invitees, KAH member fields, and the Double Booking scan target; FilterModal
 * composes `PickerBadges` + `PickerTrigger` directly for its search groups.
 * Every chip in the row is a `PickerChip` — the app-wide removable-chip recipe
 * the non-picker surfaces (recent searches, applied filters) render too.
 */
export function PickerField({
  label,
  count,
  description,
  items,
  cap,
  empty,
  onRemove,
  removeLabel,
  tt,
  size,
  triggerLabel,
  addLabel,
  editLabel,
  onOpen,
}: PickerFieldProps) {
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
        {label !== undefined && (
          <Text fw={600} size="sm">
            {label}
            {count !== undefined ? ` (${count})` : ""}
          </Text>
        )}
        <PickerTrigger
          count={count ?? items.length}
          onOpen={onOpen}
          triggerLabel={triggerLabel}
          addLabel={addLabel}
          editLabel={editLabel}
        />
      </Group>
      {description !== undefined && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}
      <PickerBadges
        items={items}
        cap={cap}
        empty={empty}
        onRemove={onRemove}
        removeLabel={removeLabel}
        tt={tt}
        size={size}
      />
    </Stack>
  );
}
