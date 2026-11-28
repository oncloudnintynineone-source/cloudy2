"use client";

import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
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
  groupDraftState,
  groupPanelRuns,
  groupRowState,
  isGroupSearchable,
  level1Entries,
  panelSections,
  sectionChipAriaLabel,
  sectionChipText,
  sectionState,
  showsSectionHeaders,
  textRowState,
  toApplyGroup,
  TEXT_ENTRY_KEY,
  type FilterPanelSection,
  type FilterRowState,
  type FilterTextRowState,
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
 * The filter dialog's body: a **two-level sheet**. Level 1 is one row per filter
 * — a row for every option group naming what that group currently does, and the
 * free-text name filter as the last one — each opening its own level 2: the
 * group's whole option list (search box, sections, selectable chips) or the one
 * field. At `lg`+ the two levels sit side by side (master–detail) instead of
 * replacing each other; nothing else about the interaction changes.
 *
 * One grammar for every group replaces the four the dialog used to mix (inline
 * badges, an Add/Edit trigger into a nested picker, folder chips opening
 * popovers, and a Show/Hide disclosure): **open the group, tap chips, Apply**.
 * What a selection *means* is always said in words — a section count and a state
 * word — so a chip's amber fill never has to carry a meaning on its own, and the
 * 5-chip summary this dialog used to cap its picks at (with an inert `+N` nobody
 * could tap) is gone: a panel lists every option, either inline or inside its
 * section's chip.
 *
 * Level 1 is the whole first screen and goes as a unit once a panel takes the
 * dialog below `lg`, so drilling in gives level 2 the entire sheet (1.444). Its
 * rows read in the order the filters are applied — calendars, users, event types,
 * and the name **last**, under a hairline, because it matches against what those
 * left — which is why nothing spells that out: the position is the message, and
 * the field spanning the top of the dialog said the opposite (1.446).
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
   * The entry whose panel is open (level 2): a group label, or
   * {@link TEXT_ENTRY_KEY} for the free-text filter; `null` shows the level-1
   * list. Owned by {@link FilterModal} so Escape and the overlay step back a
   * level instead of closing the dialog.
   */
  openLabel: string | null;
  onOpenGroup: (label: string | null) => void;
  /**
   * Which way the level just moved. The list re-mounts when a panel closes below
   * `lg`, and a re-mount cannot tell "returned to" from "first opened" — the
   * owner of the level knows, so it says, and only `back` animates (the panel's
   * own enter is CSS, since a panel is always new).
   */
  navDir?: "in" | "back";
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
  navDir = "in",
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

  const openGroup =
    openLabel !== null ? (groups.find((g) => g.label === openLabel) ?? null) : null;
  // The free-text entry is a level-1 entry like any group, so it owns its panel
  // the same way — keyed on the sentinel, never on a group label.
  const textOpen = openLabel === TEXT_ENTRY_KEY;

  // Below `lg` a panel replaces level 1 outright, so the option list (or the
  // field) gets the whole dialog. Tested on `openLabel`, not on `openGroup`: the
  // text entry has no group, and a panel that resolved to nothing still owns it.
  const showLevel1 = openLabel === null || isDesktop;

  // Entering a panel puts the caret on its Back button — never on a text field.
  // Focusing the search box here (what this did until 1.439) opened the phone
  // keyboard the moment someone opened Users, before they had asked for it; the
  // search box is still one tap away when they want to type. Guarded per group so
  // a parent re-render can't steal the caret back mid-typing.
  useEffect(() => {
    if (openLabel === null || focusedPanel.current === openLabel) {
      return;
    }
    focusedPanel.current = openLabel;
    backRef.current?.focus();
  }, [openLabel]);

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

  // The name filter's own row state, in the same grammar as a group's: an empty
  // draft is no filter, so it reads "All event names" where Users reads
  // "All users", and a term reads as the term — that is what it matches.
  const textState: FilterTextRowState | null = textFilter
    ? textRowState(textFilter.label.toLocaleLowerCase(), textDraft)
    : null;
  const textRow =
    textFilter && textState ? (
      <FilterRow
        title={textFilter.label}
        stateLabel={textState.label}
        active={textState.active}
        open={textOpen}
        ref={(node) => {
          if (node) {
            rowRefs.current.set(TEXT_ENTRY_KEY, node);
          } else {
            rowRefs.current.delete(TEXT_ENTRY_KEY);
          }
        }}
        onOpen={() => openPanel(TEXT_ENTRY_KEY)}
      />
    ) : null;
  // Level 1 in the order the filters are applied: every group, then the name.
  const entries = level1Entries(groups, textFilter !== undefined);

  return (
    <Stack gap="md" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <Box
        className="c2-filter-sheet"
        data-detail={openGroup || textOpen ? "open" : undefined}
        data-nav={openLabel === null ? navDir : undefined}
      >
        {showLevel1 && (
          /* Level 1 — one row per filter, reading in the order they are applied.
             The name filter is one of those rows (last, under a hairline) rather
             than a field above the list: the position is what says it narrows
             what the option groups left, and this dialog carries no copy to say
             it with. The row's own subtitle is the group's summary, so there is
             no separate chip strip to cap, overflow, or explain. */
          <Stack className="c2-filter-sheet__list" gap={6}>
            {entries.map((entry) => {
              if (entry.kind === "text") {
                // The hairline is the only new mark in the sheet: it separates a
                // different *kind* of filter, and it is the cue that this row is
                // the one applied last.
                return (
                  <Fragment key={entry.key}>
                    {groups.length > 0 && <Box className="c2-filter-sheet__rule" aria-hidden />}
                    {textRow}
                  </Fragment>
                );
              }
              const group = entry.group;
              const state = groupRowState(group, draft[group.label] ?? [], {
                cleared,
                touched: touched.has(group.label),
              });
              return (
                <FilterRow
                  key={entry.key}
                  title={group.label}
                  stateLabel={state.subtitle}
                  active={state.active}
                  open={openLabel === entry.key}
                  ref={(node) => {
                    if (node) {
                      rowRefs.current.set(entry.key, node);
                    } else {
                      rowRefs.current.delete(entry.key);
                    }
                  }}
                  onOpen={() => openPanel(entry.key)}
                />
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

        {textOpen && textFilter && textState && (
          <Box
            key={TEXT_ENTRY_KEY}
            className="c2-filter-sheet__detail"
            role="group"
            aria-label={textFilter.label}
          >
            <FilterTextPanel
              label={textFilter.label}
              state={textState}
              value={textDraft}
              onChange={setTextDraft}
              placeholder={textFilter.placeholder ?? "Type to match"}
              maxLength={textFilter.maxLength ?? DEFAULT_TEXT_FILTER_MAX_LENGTH}
              backRef={backRef}
              onBack={closePanel}
            />
          </Box>
        )}
      </Box>

      {/* The footer is the actions only: what the draft would apply is already
          said by the rows' own subtitles and the panel's state word (1.444
          removed the `Showing: …` echo of them). */}
      <Group justify="space-between" wrap="wrap">
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
 *
 * The pair is the **group's**, not a section's: All fills every option of every
 * section (every department's users, every folder's types) and Clear empties
 * them the same way, so a section chip is a way into a subset and never a wall
 * in front of the whole. Its buttons answer to what is ticked while the word
 * beside them answers to what that means — deliberately different questions
 * (`groupDraftState` vs `groupRowState`), because in a search group the two
 * disagree on exactly the state the panel opens in.
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
  // What is ticked across **every** section of the group — the question this
  // pair answers to, as opposed to what the empty selection *means* (below).
  const draftState = groupDraftState(group, selected);

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
        {/* Enabled by what a click would change, not by the state word beside it.
            A search group's empty draft *means* "All users", and reading that
            word here left the pair dead in the Users panel at rest — with the
            members behind department chips, that was the one place "all users in
            all departments" had to be reachable from, and the only way to it was
            a department popup at a time. `groupDraftState` asks the question a
            button answers to: what is ticked, across every section. The write was
            always whole-group (`allOptionValues`); only the enablement lied. */}
        <AllNoneControls
          label={group.label}
          allSelected={draftState === "all"}
          noneSelected={draftState === "none"}
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
        /* The quick action ("Myself") is the same chip as every option in this
           dialog — one idiom, one tap — sitting in the header band above the
           section chips rather than as a full-width button of its own. */
        <Group gap={6} wrap="wrap">
          <SelectableBadge
            label={group.action.label}
            icon={group.action.icon}
            selected={actionApplied}
            onToggle={onAction}
            ariaLabel={`${group.action.label}${actionApplied ? ", selected" : ""}`}
          />
        </Group>
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
        groupPanelRuns(sections).map((run) => {
          // Chips, not rows: the same `SelectableBadge` the user picker's pool and
          // the wizard's type step use, so a picked option looks like a picked
          // option everywhere in the app — inline under a section header or inside
          // the section's group chip.
          const sectionChips = (section: FilterPanelSection) => (
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

          if (run.kind === "chips") {
            /* One wrapping chip cloud across the run: each chip takes only the
               width its label needs (the app's chip idiom — the picker pool and
               the wizard's type step do the same), and a sub-department's
               `Parent (Department)` label carries the hierarchy the old
               left-indent used to. */
            return (
              <Group key={`chips:${run.sections[0]?.key ?? ""}`} gap={6} wrap="wrap">
                {run.sections.map((section) => {
                  const sectionSelection = sectionState(section, selected);
                  return (
                    <ChipPopover
                      key={section.key}
                      label={sectionChipText(section)}
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
                      actions={
                        <AllNoneControls
                          label={section.label}
                          allSelected={sectionSelection === "all"}
                          noneSelected={sectionSelection === "none"}
                          noneLabel={noneLabel}
                          onAll={() => onSection(section, "all")}
                          onNone={() => onSection(section, "none")}
                        />
                      }
                    >
                      {sectionChips(section)}
                    </ChipPopover>
                  );
                })}
              </Group>
            );
          }

          const { section } = run;
          const sectionSelection = sectionState(section, selected);
          return (
            <Box key={section.key} pl={namedSections ? hierarchyIndent(section.depth) : 0}>
              {namedSections && (
                <Group gap="xs" wrap="nowrap" align="center" mb={2}>
                  <Text
                    size="xs"
                    fw={600}
                    className="c2-filter-state"
                    style={{ minWidth: 0 }}
                    truncate
                  >
                    {sectionChipText(section)}
                  </Text>
                  {/* The count lives in the header, where a folder's state used to
                      be a yellow border nobody could read closed. */}
                  <Text size="xs" className="c2-filter-state" style={{ flexShrink: 0 }}>
                    {section.selectedCount} of {section.totalCount}
                  </Text>
                  {/* No popup to hold the pair, so an inline section keeps it here. */}
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
              {sectionChips(section)}
            </Box>
          );
        })
      )}
    </Stack>
  );
}

interface FilterRowProps {
  title: string;
  /** What this filter currently does — the row's whole summary. */
  stateLabel: string;
  active: boolean;
  open: boolean;
  /** React 19 ref-as-prop: the list registers the row so leaving its panel
   *  returns the caret to exactly where it left. */
  ref?: (node: HTMLButtonElement | null) => void;
  onOpen: () => void;
}

/**
 * A level-1 row: the filter's name over what it currently does, and a chevron
 * that says "this opens".
 *
 * Every entry renders through this one component — option group and free-text
 * filter alike — which is the point: sharing the markup (and the 44px floor, the
 * hover, the focus ring and the `aria-expanded`) is what makes the name read as
 * the fourth filter rather than as a field that wandered into the list.
 */
function FilterRow({ title, stateLabel, active, open, ref, onOpen }: FilterRowProps) {
  return (
    <UnstyledButton
      className="c2-filter-row"
      data-open={open || undefined}
      aria-expanded={open}
      aria-label={`${title}, ${stateLabel}`}
      ref={ref}
      onClick={onOpen}
    >
      <Group gap="xs" wrap="nowrap" align="center">
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} size="sm" truncate>
            {title}
          </Text>
          {/* The state word is the whole summary; the amber tint only reinforces
              it (colour is never the cue). */}
          <Text size="xs" className="c2-filter-state" data-active={active || undefined} truncate>
            {stateLabel}
          </Text>
        </Box>
        <IconChevronRight size={16} aria-hidden style={{ flexShrink: 0 }} />
      </Group>
    </UnstyledButton>
  );
}

interface FilterTextPanelProps {
  label: string;
  state: FilterTextRowState;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength: number;
  backRef: RefObject<HTMLButtonElement | null>;
  onBack: () => void;
}

/**
 * Level 2 of the free-text entry: the same header recipe as a group panel —
 * Back, the entry's name, its state word — over the one control that belongs
 * here, so drilling into the name filter is the same gesture as drilling into
 * Users and lands the caret in the same place.
 *
 * No All/Clear pair: that pair is the vocabulary of an option group, and this
 * field's own ✕ is its clear. And no autofocus — the dialog's rule that nothing
 * in it summons the phone keyboard by itself (1.439) holds for its fourth entry
 * exactly as it does for the other three.
 */
function FilterTextPanel({
  label,
  state,
  value,
  onChange,
  placeholder,
  maxLength,
  backRef,
  onBack,
}: FilterTextPanelProps) {
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
            {label}
          </Text>
          <Text size="xs" className="c2-filter-state" data-active={state.active || undefined} truncate>
            {state.label}
          </Text>
        </Box>
      </Group>

      <TextInput
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        leftSection={<IconSearch size={16} />}
        rightSectionPointerEvents="all"
        rightSection={
          value.length > 0 ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={`Clear ${label}`}
              onClick={() => onChange("")}
            >
              <IconX size={14} />
            </ActionIcon>
          ) : undefined
        }
      />
    </Stack>
  );
}
