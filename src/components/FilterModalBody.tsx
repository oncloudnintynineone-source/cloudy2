"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronLeft, IconChevronRight, IconSearch, IconX } from "@tabler/icons-react";

import { AllNoneControls } from "@/components/AllNoneControls";
import { ChipPopover } from "@/components/ChipPopover";
import { EmptyState } from "@/components/EmptyState";
import { SelectableBadge } from "@/components/SelectableBadge";
import {
  effectiveSetLine,
  groupRowState,
  isGroupSearchable,
  panelSections,
  sectionChipAriaLabel,
  sectionChipLabel,
  sectionRendersAsChip,
  sectionState,
  showsSectionHeaders,
  toApplyGroup,
  type FilterPanelSection,
  type FilterRowState,
} from "@/lib/filters/filterDialogModel";
import { applySectionSelection } from "@/lib/filters/filterSections";
import { isGroupUnfiltered, resolveFilterApply } from "@/lib/filters/resolveFilterApply";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { hierarchyIndent } from "@/lib/ui/pickerHierarchy";

import type { FilterGroup, FilterModalProps } from "./FilterModal";

/** Fallback cap for an optional free-text filter (callers may override). */
const DEFAULT_TEXT_FILTER_MAX_LENGTH = 120;

function allOptionValues(group: FilterGroup): string[] {
  return group.options.map((option) => option.value);
}

/**
 * Build the initial draft selection for the dialog: a grid group with no applied
 * filter shows every option selected ("all selected" = no filter); a search group
 * with no applied filter shows nothing selected ("empty" = no filter). Otherwise
 * the draft mirrors the applied subset.
 *
 * The two rules are a storage fact (`resolveFilterApply`), not a UI choice, and
 * the dialog no longer asks the user to discover it: each group's row says what
 * its current selection *means* ("All calendars", "2 of 3 users"), so an empty
 * search group and a fully ticked grid group both honestly read "All".
 */
function initialDraft(
  groups: FilterGroup[],
  values: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    groups.map((group) =>
      group.variant === "search"
        ? [group.label, values[group.label] ?? []]
        : [
            group.label,
            values[group.label]?.length ? values[group.label] : allOptionValues(group),
          ],
    ),
  );
}

/**
 * The filter dialog's body: a **two-level sheet**. Level 1 is one row per group
 * naming what that group currently does; level 2 is that group's whole option
 * list — search box, sections, selectable chips — filling the same dialog. At
 * `lg`+ the two levels sit side by side (master–detail) instead of replacing each
 * other; nothing else about the interaction changes.
 *
 * One grammar for every group replaces the four the dialog used to mix (inline
 * badges, an Add/Edit trigger into a nested picker, folder chips opening
 * popovers, and a Show/Hide disclosure): **open the group, tap chips, Apply**.
 * What a selection *means* is always said in words — a section count, a state
 * word, and one footer line naming the effective result set — so a chip's amber
 * fill never has to carry a meaning on its own, and the 5-chip summary this
 * dialog used to cap its picks at (with an inert `+N` nobody could tap) is gone:
 * a panel lists every option, either inline or inside its section's chip.
 *
 * `FilterGroupSection.collapsible` **is** honoured: a section the admin kept
 * collapsible hides its members behind a group chip (the same `ChipPopover` the
 * wizard's type step uses — group name, `n of m`, tap to open), while an inline
 * section lists its chips straight away. With one section left there is nothing
 * to hide behind, so even a collapsible one lists inline.
 *
 * Split into its own chunk so the modal chrome can animate out of the trigger
 * before {@link FilterModal} finishes loading this body
 * (docs/loading-transitions.md §1.15.1). Design: docs/dashboard-views.md §1.2.
 */
export interface FilterModalBodyProps
  extends Pick<FilterModalProps, "groups" | "values" | "onApply" | "textFilter" | "onClose"> {
  /**
   * The group whose panel is open (level 2); `null` shows the group list. Owned
   * by {@link FilterModal} so Escape and the overlay step back a level instead
   * of closing the dialog.
   */
  openLabel: string | null;
  onOpenGroup: (label: string | null) => void;
  /**
   * True while a section's group chip has its popup open. The dialog owns
   * Escape, so it needs this to close the popup first and leave the panel alone.
   */
  onChipOpenChange?: (open: boolean) => void;
}

export function FilterModalBody({
  groups,
  values,
  onApply,
  textFilter,
  onClose,
  openLabel,
  onOpenGroup,
  onChipOpenChange,
}: FilterModalBodyProps) {
  const theme = useMantineTheme();
  // `lg` (640px) is where there is room to keep the group list visible beside a
  // panel; below it the panel takes the dialog and Back returns the list.
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);

  const [draft, setDraft] = useState<Record<string, string[]>>(() => initialDraft(groups, values));
  // Free-text filter draft; blank means "no text filter". Staged like the
  // groups and only applied on Apply.
  const [textDraft, setTextDraft] = useState<string>(() => textFilter?.value ?? "");
  // Groups the user edited (they apply their draft explicitly — including a
  // full selection) and whether "Reset filters" was pressed (apply nothing,
  // restoring the consumer's role defaults). Untouched groups re-apply their
  // current values, so re-opening the dialog and pressing Apply keeps an
  // existing filter.
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [cleared, setCleared] = useState(false);
  // Kept up through an async `onApply` (a server write) so the button shows a
  // spinner and can't be double-fired; the dialog closes once it resolves.
  const [applying, setApplying] = useState(false);
  const [query, setQuery] = useState("");
  // Which section's group chip currently has its popup open (one at a time —
  // the same rule Mantine gives a popover anyway). `FilterModal` needs to know,
  // because it owns Escape: with a popup open, Escape must close the popup and
  // leave the panel where it is, not step the sheet back a level.
  const [openChipKey, setOpenChipKey] = useState<string | null>(null);

  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const backRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusedPanel = useRef<string | null>(null);
  const prevOpenLabel = useRef<string | null>(null);

  const openGroup = openLabel !== null ? (groups.find((g) => g.label === openLabel) ?? null) : null;

  // Entering a panel moves the caret to its search box (the fastest way through
  // a long list); a short list keeps focus on Back, which is where Escape and
  // the thumb both are. Guarded per group so a parent re-render can't steal the
  // caret back mid-typing.
  useEffect(() => {
    if (openLabel === null || focusedPanel.current === openLabel) {
      return;
    }
    focusedPanel.current = openLabel;
    const group = groups.find((candidate) => candidate.label === openLabel);
    if (group && isGroupSearchable(group)) {
      searchRef.current?.focus();
    } else {
      backRef.current?.focus();
    }
  }, [openLabel, groups]);

  // Leaving a panel — by the Back button or by Escape, which the modal owns —
  // puts the caret back on the row the user came from, so the keyboard never
  // lands on `<body>` mid-dialog, and clears the entry guard so the next entry
  // re-places it. Below `lg` the list becomes visible again in this same commit,
  // so the row is focusable by the time this runs.
  useEffect(() => {
    const leaving = prevOpenLabel.current;
    prevOpenLabel.current = openLabel;
    if (openLabel !== null || leaving === null) {
      return;
    }
    focusedPanel.current = null;
    rowRefs.current.get(leaving)?.focus();
  }, [openLabel]);

  function openPanel(label: string) {
    setQuery("");
    setOpenChipKey(null);
    onOpenGroup(label);
  }

  function closePanel() {
    setQuery("");
    setOpenChipKey(null);
    onOpenGroup(null);
  }

  /** One chip popup at a time, and the modal is told so its Escape can defer. */
  function setChipOpen(key: string | null) {
    setOpenChipKey(key);
    onChipOpenChange?.(key !== null);
  }

  function commitGroupValue(key: string, value: string[]) {
    // No "keep the last tick" guard: an empty selection is a real, reachable
    // state (it is what the group's own None/Clear always produced), so the
    // untick that empties a group does what it looks like it does — and the row
    // then says "No calendars" instead of silently refusing.
    setDraft((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => new Set(prev).add(key));
    setCleared(false);
  }

  function toggleOption(group: FilterGroup, value: string) {
    const current = draft[group.label] ?? [];
    commitGroupValue(
      group.label,
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );
  }

  async function handleApply() {
    if (applying) return;
    setApplying(true);
    try {
      await onApply(
        resolveFilterApply(groups.map(toApplyGroup), draft, values, touched, cleared),
        { cleared, text: textDraft.trim() },
      );
      onClose();
    } finally {
      setApplying(false);
    }
  }

  function handleClear() {
    setDraft(initialDraft(groups, {}));
    setTouched(new Set());
    setTextDraft("");
    setCleared(true);
  }

  const hasActiveFilter =
    (textFilter !== undefined && textDraft.trim() !== "") ||
    groups.some((group) => !isGroupUnfiltered(toApplyGroup(group), draft[group.label] ?? []));

  const resultLine = effectiveSetLine(
    groups,
    draft,
    textFilter ? { label: textFilter.label, value: textDraft } : undefined,
    { cleared, touched },
  );

  const openSelected = openGroup ? (draft[openGroup.label] ?? []) : [];
  const openState = openGroup
    ? groupRowState(openGroup, openSelected, {
        cleared,
        touched: touched.has(openGroup.label),
      })
    : null;
  // Recomputed per render: it is a filter + fuzzy pass over one group, and only
  // while that group's panel is on screen.
  const sections = openGroup
    ? panelSections(openGroup, query, draft[openGroup.label] ?? [])
    : [];

  const textInput = textFilter ? (
    <Box className="c2-filter-sheet__aside">
      <Text fw={600} size="sm" mb={4}>
        {textFilter.label}
      </Text>
      <TextInput
        aria-label={textFilter.label}
        value={textDraft}
        onChange={(event) => setTextDraft(event.currentTarget.value)}
        placeholder={textFilter.placeholder ?? "Type to match"}
        maxLength={textFilter.maxLength ?? DEFAULT_TEXT_FILTER_MAX_LENGTH}
        leftSection={<IconSearch size={16} />}
        rightSectionPointerEvents="all"
        rightSection={
          textDraft.length > 0 ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={`Clear ${textFilter.label}`}
              onClick={() => setTextDraft("")}
            >
              <IconX size={14} />
            </ActionIcon>
          ) : undefined
        }
      />
    </Box>
  ) : null;

  return (
    <Stack gap="md" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <Box
        className="c2-filter-sheet"
        data-detail={openGroup ? "open" : undefined}
        data-aside={textInput ? "true" : undefined}
      >
        {/* The free-text filter is not a group, so it is not a row: it spans the
            sheet above both levels and stays put while a panel is open. */}
        {textInput}
        {(openGroup === null || isDesktop) && (
          /* Level 1 — one row per group. The row's own subtitle is the group's
             summary, so there is no separate chip strip to cap, overflow, or
             explain. */
          <Stack className="c2-filter-sheet__list" gap={6}>
            {groups.map((group) => {
              const state = groupRowState(group, draft[group.label] ?? [], {
                cleared,
                touched: touched.has(group.label),
              });
              return (
                <UnstyledButton
                  key={group.label}
                  className="c2-filter-row"
                  data-active={state.active || undefined}
                  data-open={openLabel === group.label || undefined}
                  aria-expanded={openLabel === group.label}
                  aria-label={`${group.label}, ${state.subtitle}`}
                  ref={(node) => {
                    if (node) {
                      rowRefs.current.set(group.label, node);
                    } else {
                      rowRefs.current.delete(group.label);
                    }
                  }}
                  onClick={() => openPanel(group.label)}
                >
                  <Group gap="xs" wrap="nowrap" align="center">
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={600} size="sm" truncate>
                        {group.label}
                      </Text>
                      {/* The state word is the whole summary; the amber tint only
                          reinforces it (colour is never the cue). */}
                      <Text
                        size="xs"
                        className="c2-filter-state"
                        data-active={state.active || undefined}
                        truncate
                      >
                        {state.subtitle}
                      </Text>
                    </Box>
                    <IconChevronRight size={16} aria-hidden style={{ flexShrink: 0 }} />
                  </Group>
                </UnstyledButton>
              );
            })}
          </Stack>
        )}

        {openGroup && openState && (
          <Box
            key={openGroup.label}
            className="c2-filter-sheet__detail"
            role="group"
            aria-label={openGroup.label}
          >
            <FilterGroupPanel
              group={openGroup}
              state={openState}
              selected={openSelected}
              sections={sections}
              query={query}
              onQuery={setQuery}
              searchRef={searchRef}
              backRef={backRef}
              onBack={closePanel}
              openChipKey={openChipKey}
              onChipOpenChange={setChipOpen}
              onToggle={(value) => toggleOption(openGroup, value)}
              onAll={() => commitGroupValue(openGroup.label, allOptionValues(openGroup))}
              onNone={() => commitGroupValue(openGroup.label, [])}
              onSection={(section, mode) =>
                commitGroupValue(
                  openGroup.label,
                  applySectionSelection(section.options, openSelected, mode),
                )
              }
              onAction={() =>
                openGroup.action?.apply((next) => commitGroupValue(openGroup.label, next), {
                  selected: [...openSelected],
                  allValues: allOptionValues(openGroup),
                })
              }
            />
          </Box>
        )}
      </Box>

      <Box>
        {/* The dialog's one statement of what Apply will do — the group rows'
            own subtitles, so the line and the rows cannot disagree. */}
        <Text size="xs" className="c2-filter-result c2-filter-state">
          Showing: {resultLine}
        </Text>
        <Group justify="space-between" mt={6} wrap="wrap">
          {/* "Reset filters" restores the role defaults; a group's own "None" is a
              different thing (an explicit empty selection) and keeps that name. */}
          <Button variant="subtle" color="gray" onClick={handleClear} disabled={!hasActiveFilter}>
            Reset filters
          </Button>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleApply()}
              loading={applying}
              disabled={applying}
              loaderProps={BUTTON_LOADER_PROPS}
            >
              Apply
            </Button>
          </Group>
        </Group>
      </Box>
    </Stack>
  );
}

interface FilterGroupPanelProps {
  group: FilterGroup;
  /** The group's live row state (same computation the list row shows). */
  state: FilterRowState;
  /** The group's whole draft (ids outside the visible query included). */
  selected: readonly string[];
  /** The drafted sections for the current query, with their own counts. */
  sections: readonly FilterPanelSection[];
  query: string;
  onQuery: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  backRef: RefObject<HTMLButtonElement | null>;
  onBack: () => void;
  /** The section whose group chip has its popup open, if any. */
  openChipKey: string | null;
  onChipOpenChange: (key: string | null) => void;
  onToggle: (value: string) => void;
  onAll: () => void;
  onNone: () => void;
  onSection: (section: FilterPanelSection, mode: "all" | "none") => void;
  onAction: () => void;
}

/**
 * Level 2: one group's whole option list. Back + the group's own state + its
 * All/None pair, the search box (only for a list too long to scan), the quick
 * action as a full-width row, then every option as a chip under its section
 * header — or, when the section is a real group, behind that section's own chip.
 *
 * The pair's second word names what an empty selection *means* in this group —
 * **None** (nothing will match) for a grid group, **Clear** (no picks, so
 * nothing is filtered) for a search group — and the state word beside it says
 * the same thing, which is the one polarity question the old dialog left the
 * user to infer.
 */
function FilterGroupPanel({
  group,
  state,
  selected,
  sections,
  query,
  onQuery,
  searchRef,
  backRef,
  onBack,
  openChipKey,
  onChipOpenChange,
  onToggle,
  onAll,
  onNone,
  onSection,
  onAction,
}: FilterGroupPanelProps) {
  const searchable = isGroupSearchable(group);
  const noneLabel = group.variant === "search" ? "Clear" : "None";
  const namedSections = showsSectionHeaders(group, sections);
  const actionApplied = group.action?.isApplied([...selected]) ?? false;

  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="nowrap" align="center">
        <ActionIcon
          ref={backRef}
          variant="subtle"
          color="gray"
          size="lg"
          radius="md"
          aria-label="Back to filters"
          onClick={onBack}
        >
          <IconChevronLeft size={18} />
        </ActionIcon>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} size="sm" truncate>
            {group.label}
          </Text>
          <Text size="xs" className="c2-filter-state" data-active={state.active || undefined}>
            {state.label}
          </Text>
        </Box>
        <AllNoneControls
          label={group.label}
          allSelected={state.kind === "all"}
          /* Nothing to clear when the selection is already empty — for a search
             group an empty draft reads as "All", so the state word alone would
             leave "Clear" looking live when its click changes nothing. */
          noneSelected={selected.length === 0}
          noneLabel={noneLabel}
          onAll={onAll}
          onNone={onNone}
          size="sm"
        />
      </Group>

      {searchable && (
        <TextInput
          ref={searchRef}
          aria-label={`Search ${group.label}`}
          value={query}
          onChange={(event) => onQuery(event.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
          rightSectionPointerEvents="all"
          rightSection={
            query.length > 0 ? (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Clear search ${group.label}`}
                onClick={() => onQuery("")}
              >
                <IconX size={14} />
              </ActionIcon>
            ) : undefined
          }
        />
      )}

      {group.action && (
        /* The quick action ("Myself") is a row-scale toggle, not a tiny button
           beside a header: it is the single fastest way to the one calendar most
           people open this dialog for. */
        <Button
          className="c2-filter-quick"
          variant="light"
          color="brand"
          justify="flex-start"
          leftSection={group.action.icon}
          aria-pressed={actionApplied}
          onClick={onAction}
        >
          {group.action.label}
        </Button>
      )}

      {sections.length === 0 ? (
        <EmptyState
          description={
            group.options.length === 0
              ? `No ${group.label.toLocaleLowerCase()} to choose from`
              : "No matches"
          }
          actionLabel={group.options.length === 0 ? undefined : "Clear search"}
          onAction={group.options.length === 0 ? undefined : () => onQuery("")}
        />
      ) : (
        sections.map((section) => {
          const sectionSelection = sectionState(section, selected);
          // A section hides its members behind its own chip when the panel really
          // is chunked and the admin left the group collapsible (an option list
          // that spills every user onto one wall is exactly what this fixes).
          const asChip = namedSections && sectionRendersAsChip(section, sections);
          // Chips, not rows: the same `SelectableBadge` the user picker's pool and
          // the wizard's type step use, so a picked option looks like a picked
          // option everywhere in the app — either inline under the section header
          // or inside the section's group chip.
          const chips = (
            <Group gap={6} wrap="wrap">
              {section.options.map((option) => (
                <SelectableBadge
                  key={option.value}
                  label={option.label}
                  self={option.self}
                  selected={selected.includes(option.value)}
                  onToggle={() => onToggle(option.value)}
                />
              ))}
            </Group>
          );
          return (
            <Box key={section.key} pl={namedSections ? hierarchyIndent(section.depth) : 0}>
              {namedSections && (
                <Group gap="xs" wrap="nowrap" align="center" mb={2}>
                  {asChip ? (
                    /* The wizard's group chip, reused: the group name is what you
                       tap, its members stay hidden until you do. The count rides
                       the chip in words ("Logistics 3 of 7") so a group's state is
                       never just a fill, and All/Clear stay outside it so a whole
                       department is still one tap away. */
                    <Box style={{ minWidth: 0 }}>
                      <ChipPopover
                        label={sectionChipLabel(section)}
                        ariaLabel={sectionChipAriaLabel(section)}
                        optionsLabel={`${section.label} options`}
                        badgeClassName="c2-filter-group-chip"
                        labelNowrap={false}
                        focusOnOpen
                        open={openChipKey === section.key}
                        onOpenChange={(next) => onChipOpenChange(next ? section.key : null)}
                        selected={sectionSelection === "all"}
                        partial={sectionSelection === "some"}
                        dropdownMaxWidth={320}
                      >
                        {chips}
                      </ChipPopover>
                    </Box>
                  ) : (
                    <>
                      <Text
                        size="xs"
                        fw={600}
                        className="c2-filter-state"
                        style={{ minWidth: 0 }}
                        truncate
                      >
                        {section.label}
                      </Text>
                      {/* The count lives in the header, where a folder's state used to
                          be a yellow border nobody could read closed. */}
                      <Text size="xs" className="c2-filter-state" style={{ flexShrink: 0 }}>
                        {section.selectedCount} of {section.totalCount}
                      </Text>
                    </>
                  )}
                  <Box ml="auto" style={{ flexShrink: 0 }}>
                    <AllNoneControls
                      label={section.label}
                      allSelected={sectionSelection === "all"}
                      noneSelected={sectionSelection === "none"}
                      noneLabel={noneLabel}
                      onAll={() => onSection(section, "all")}
                      onNone={() => onSection(section, "none")}
                      size="sm"
                    />
                  </Box>
                </Group>
              )}
              {!asChip && chips}
            </Box>
          );
        })
      )}
    </Stack>
  );
}
