"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useMantineTheme } from "@mantine/core";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { FormModalSkeleton } from "@/components/FormModalSkeleton";
import { MotionModal } from "@/components/MotionModal";
import { useMotion } from "@/components/MotionProvider";
import { loadChunk, useChunkReady } from "@/lib/loading/chunkReady";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import { modalContentWidth, type Rect } from "@/lib/motion/origin";
import { modalZoomTransitionProps } from "@/lib/motion/transitions";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";

// The body (badge grids, the event-type picker and the nested user picker) is
// large and only needed once the dialog opens. The chrome stays static so the
// dialog zooms out of the trigger immediately and the chunk skeleton dissolves
// inside it, instead of `next/dynamic` swapping a whole animated fallback modal
// for the real one and replaying the entrance (docs/loading-transitions.md
// §1.15.1).
const loadFilterModalBody = () =>
  import("./FilterModalBody").then((mod) => mod.FilterModalBody);
const FilterModalBody = dynamic(loadFilterModalBody, { ssr: false, loading: () => null });

/** Warm the filter body chunk on trigger intent (hover/focus/pointer-down). */
export function preloadFilterModalBody() {
  void loadChunk(loadFilterModalBody).catch(() => {});
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
   * Folder-style section: rendered as a chip whose popup holds the badges.
   * `false` sections render directly as a labeled row.
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
   * Optional grouped presentation: inline sections render as labeled rows of
   * badges, folder sections as chips whose popups hold their badges (see
   * `EventTypeGroupGrid`; flat groups omit this).
   */
  sections?: FilterGroupSection[];
  /** Optional quick action rendered beside the group label (e.g. "My Events"). */
  action?: FilterGroupAction;
  /**
   * "grid" (default) renders the options as toggleable `SelectableBadge`s,
   * optionally chunked into `sections` (event-type groups) as a tile grid
   * whose tiles open badge popups (see `EventTypeGroupGrid`). "search" renders a
   * badge picker dialog (UserSelectModal) for large option lists:
   * the currently selected options appear as badges beside a Select trigger,
   * and the dialog filters them by a search box. Search groups use "empty =
   * no filter" semantics, so narrowing 100 options down to a few never
   * requires unticking the rest.
   */
  variant?: "grid" | "search";
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

/** Result of an Apply: the resolved values plus whether "Clear" produced them. */
export interface FilterApplyMeta {
  /**
   * True when the user pressed "Clear" (then Apply). Grid groups resolve to an
   * empty array either way, so a consumer that distinguishes "role default"
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
   * standard grow/shrink-from-element zoom animation (see `lib/motion/origin`).
   * Omit for a plain centered zoom.
   */
  originRect?: Rect | null;
  /**
   * Group labels that start collapsed behind a "Show …" toggle. Only the
   * groups most users reach stay open (the dashboard promotes Calendars +
   * Users and tucks Event Types away); audit-log/user-table callers omit this
   * and keep every group expanded.
   */
  collapsedGroupLabels?: string[];
  /** Optional dimmed hint above the actions (e.g. the per-view scope note). */
  hint?: string;
}

/**
 * Reusable filter dialog: opens from a trigger button and presents each filter
 * group as selectable badges — flat, split into labeled rows and folder chips
 * (see `EventTypeGroupGrid`), or as
 * a selected-badge summary + Select trigger that opens the UserSelectModal badge
 * picker (variant "search", for large option lists). Every group gets an All/None
 * pair (search groups say "Clear"); grouped lists keep section counts, but the
 * All/None action spans the whole group.
 * Selections are staged in a draft and only applied when "Apply" is pressed. The
 * draft lives in a child that mounts with the modal, so it re-initializes from the
 * current applied values every time the dialog opens. "No filter applied" is "all
 * selected" in grid groups and "nothing selected" in search groups.
 */
export function FilterModal({
  opened,
  onClose,
  title,
  groups,
  values,
  onApply,
  textFilter,
  collapsedGroupLabels,
  hint,
  originRect = null,
}: FilterModalProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const motion = useMotion();
  const bodyReady = useChunkReady(loadFilterModalBody, opened);

  // The modal zooms out of / shrinks back into the trigger button (the app's
  // standard grow/shrink animation; mirror the other zoom modals).
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  const contentWidth = modalContentWidth(viewport, isNarrow ? 300 : isDesktop ? 440 : 380);
  const transitionProps = modalZoomTransitionProps(motion, originRect, viewport, contentWidth);

  return (
    <MotionModal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
      transitionProps={transitionProps}
      styles={{
        content: {
          maxHeight: "min(680px, calc(100dvh - 96px))",
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
        className="c2-filter-modal-swap"
        skeleton={<FormModalSkeleton rows={6} label="Loading filters" />}
      >
        <FilterModalBody
          groups={groups}
          values={values}
          onApply={onApply}
          textFilter={textFilter}
          onClose={onClose}
          collapsedGroupLabels={collapsedGroupLabels}
          hint={hint}
        />
      </CrossfadeSwap>
    </MotionModal>
  );
}
