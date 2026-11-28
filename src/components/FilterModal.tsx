"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { MotionModal } from "@/components/MotionModal";
import { preloadLazyBody, useChunkReady } from "@/lib/loading/chunkReady";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import type { Rect } from "@/lib/motion/origin";
import { useModalZoom } from "@/lib/motion/useModalZoom";

// The body (the group rows, their option panels and the section math) is large
// and only needed once the dialog opens. The chrome stays static so the dialog
// zooms out of the trigger immediately and the chunk skeleton dissolves inside
// it, instead of `next/dynamic` swapping a whole animated fallback modal for the
// real one and replaying the entrance (docs/loading-transitions.md §1.15.1).
const loadFilterModalBody = () =>
  import("./FilterModalBody").then((mod) => mod.FilterModalBody);
const FilterModalBody = dynamic(loadFilterModalBody, { ssr: false, loading: () => null });

/** Warm the filter body chunk on trigger intent (hover/focus/pointer-down). */
export function preloadFilterModalBody() {
  preloadLazyBody(loadFilterModalBody);
}

export interface FilterOption {
  value: string;
  label: string;
  /** Optional case-insensitive search terms beyond the label. */
  search?: string;
  /**
   * Department (grouping) name for search-variant groups: when present, the
   * picker dialog shows one badge section per department instead of one flat
   * list. Absent (undefined) = flat section.
   */
  department?: string | null;
  /**
   * The department's display order (calendars.sort_order) for search-variant
   * groups: when present the department sections follow the Settings →
   * Departments order instead of sorting alphabetically.
   */
  departmentSort?: number | null;
  /**
   * The department's registry id (calendars.id) for search-variant groups.
   * Together with `departmentParentId` it lets the picker nest a department's
   * section under its parents (id-keyed grouping, stable across renames).
   */
  departmentId?: string | null;
  /**
   * The department's parent department id (calendars.parent_id), used with
   * `departmentId` to compute each section's nesting depth.
   */
  departmentParentId?: string | null;
  /** True when this option is the signed-in user (amber "mine" badge). */
  self?: boolean;
}

/**
 * A presentation-only section inside a filter group (event-type groups, the
 * department blocks of a user picker, …). The group's flat `options` stay the
 * canonical value list for apply/count logic; sections only decide how the
 * options are chunked on screen.
 */
export interface FilterGroupSection {
  /** Stable identity across re-renders (event-type group id, department id, …). */
  id: string;
  label: string;
  /**
   * Folder-style section: the wizard renders it as a chip whose popup holds the
   * badges, an inline one as a labeled row. The filter dialog **ignores** this
   * and renders every section as the same header + rows — a folder whose state
   * was a yellow border was unreadable until it was opened.
   */
  collapsible: boolean;
  options: FilterOption[];
}

export interface FilterGroupAction {
  label: string;
  icon?: ReactNode;
  /** True when the quick action is currently active (drives the button styling). */
  isApplied: (selected: string[]) => boolean;
  /** Called on click with this group's draft value setter and current values. */
  apply: (
    setValues: (values: string[]) => void,
    context: { selected: string[]; allValues: string[] },
  ) => void;
}

export interface FilterGroup {
  label: string;
  /** Every selectable value in the group (also the union of `sections`). */
  options: FilterOption[];
  /**
   * Optional grouping: each section becomes a header (with its own count and
   * All/None pair) above its rows in the group's panel. Flat groups omit this.
   */
  sections?: FilterGroupSection[];
  /** Optional quick action offered inside the group's panel (e.g. "Myself"). */
  action?: FilterGroupAction;
  /**
   * Selection **semantics**, not a layout switch — the dialog renders every
   * group the same way now. "grid" (default) means an empty selection is a real
   * filter (nothing will match); "search" means an empty selection is *no*
   * filter. The group's row says which in words ("All calendars" / "All users"
   * vs "No calendars"), so the difference never has to be guessed.
   */
  variant?: "grid" | "search";
  /**
   * Force the group's panel to carry (or drop) a search box. By default one
   * appears when the list is longer than `FILTER_SEARCH_THRESHOLD` options.
   */
  searchable?: boolean;
}

/**
 * Optional free-text filter rendered above the option groups. It is staged in
 * the same draft as the groups and returned through `FilterApplyMeta.text` on
 * Apply; a blank value means "no text filter".
 */
export interface FilterTextGroup {
  label: string;
  /** The currently applied value (empty when none). */
  value: string;
  placeholder?: string;
  maxLength?: number;
}

/** Result of an Apply: the resolved values plus whether "Reset filters" produced them. */
export interface FilterApplyMeta {
  /**
   * True when the user pressed "Reset filters" (then Apply). Grid groups resolve
   * to an empty array either way, so a consumer that distinguishes "role default"
   * from a genuine empty selection (the dashboard) reads this flag instead.
   */
  cleared: boolean;
  /**
   * The trimmed free-text filter draft, present when the caller supplied a
   * `textFilter`. Empty string = no text filter.
   */
  text?: string;
}

export interface FilterModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  groups: FilterGroup[];
  values: Record<string, string[]>;
  onApply: (values: Record<string, string[]>, meta: FilterApplyMeta) => void | Promise<void>;
  /** Optional free-text filter rendered above the groups (e.g. event name). */
  textFilter?: FilterTextGroup;
  /**
   * Viewport rect of the trigger button, captured on tap. Drives the modal's
   * standard grow-from-element zoom animation (see `lib/motion/origin`).
   * Omit for a plain centered zoom.
   */
  originRect?: Rect | null;
}

/**
 * Reusable filter dialog: a **two-level sheet**. Level 1 lists the groups, each
 * row naming what that group currently does ("Calendars · All", "Users · 3 of
 * 12"); tapping a row opens that group's whole option list — search box,
 * sections, touch-sized checkbox rows — in the same dialog (side by side at
 * `lg`+). One gesture per group ("open it, tap rows") replaces the badge wall,
 * the Add/Edit trigger into a nested picker, the folder chips with popovers and
 * the Show/Hide disclosure this dialog used to mix, and the footer states the
 * effective result set in one line.
 *
 * Selections are staged in a draft and only applied on "Apply"; "Reset filters"
 * restores the role defaults (rows then read "Default", because that is what
 * Apply will store). A group's own "None" stays a separate, named thing: an
 * explicit empty selection. "No filter applied" is an empty selection in a
 * search group and a full one in a grid group — a storage fact the rows state
 * in words instead of asking the user to infer it.
 *
 * Design: docs/dashboard-views.md §1.2, docs/user-picker.md §1.7.
 */
export function FilterModal({
  opened,
  onClose,
  title,
  groups,
  values,
  onApply,
  textFilter,
  originRect = null,
}: FilterModalProps) {
  const bodyReady = useChunkReady(loadFilterModalBody, opened);
  // The drill-in level lives here because Mantine routes Escape and the
  // overlay tap to the modal: with a group open they step back to the list
  // instead of closing the dialog. Every close path — footer, Escape, overlay —
  // is this component's `onClose`, so `close()` is where the level resets; the
  // dialog never reopens into a panel the user left behind.
  const [openLabel, setOpenLabel] = useState<string | null>(null);

  function close() {
    setOpenLabel(null);
    onClose();
  }

  // The modal zooms out of / shrinks back into the trigger button (the app's
  // standard grow/shrink animation; mirror the other zoom modals). `lg` on
  // desktop is the two-column budget, not generosity: at `md` (440) the side
  // panel leaves ~250px for the option list, which truncates section names
  // beside their own All/Clear pair.
  const { size, transitionProps } = useModalZoom({
    originRect,
    spec: { narrow: "xs", mobile: "sm", desktop: "lg" },
    contentWidthPx: { narrow: 300 },
  });

  return (
    <MotionModal
      opened={opened}
      onClose={openLabel !== null ? () => setOpenLabel(null) : close}
      title={title}
      centered
      size={size}
      transitionProps={transitionProps}
      styles={{
        content: {
          // Two terms, two jobs: `88dvh` fills a tall screen almost entirely
          // (the group list scrolls, so a shorter dialog only means more
          // scrolling) while still reading as a dialog, and `880px` stops a
          // huge monitor turning it into an endless wall of checkboxes. Both
          // sit inside Mantine's own 90dvh content clamp (default 5dvh
          // offset), and the header/body split is flexed out of that box, so
          // no chrome arithmetic belongs here — unlike the wizard, which owns
          // its gutters (docs/event-lifecycle.md §1.4).
          maxHeight: "min(88dvh, 880px)",
          display: "flex",
          flexDirection: "column",
        },
        body: {
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <CrossfadeSwap
        loading={opened && !bodyReady}
        minHoldMs={MIN_SKELETON_HOLD_MS}
        mode="overlay"
        animateHeight
        className="c2-filter-modal-swap"
        skeleton={<FormModalSkeleton rows={6} label="Loading filters" />}
      >
        <FilterModalBody
          groups={groups}
          values={values}
          onApply={onApply}
          textFilter={textFilter}
          openLabel={openLabel}
          onOpenGroup={setOpenLabel}
          onClose={close}
        />
      </CrossfadeSwap>
    </MotionModal>
  );
}
