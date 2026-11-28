# 1. User & option pickers

Two conventions keep dropdowns mobile-friendly: dropdowns must never pop the on-screen
keyboard, and picking from a large option list (users, departments) is a **badge
dialog**, never a searchable dropdown.

## Table of contents

- [1.1 No keyboard pop-up from dropdown taps](#11-no-keyboard-pop-up-from-dropdown-taps)
- [1.2 UserSelectModal — the badge dialog](#12-userselectmodal--the-badge-dialog)
- [1.3 Pure helpers](#13-pure-helpers)
- [1.4 Callers](#14-callers)
- [1.5 File index & related docs](#15-file-index--related-docs)
- [1.6 PickerChip / PickerBadges / PickerField — the shared chip, summary & trigger](#16-pickerchip--pickerbadges--pickerfield--the-shared-chip-summary--trigger)
- [1.7 Selection state & one-tap removal](#17-selection-state--one-tap-removal)

## 1.1 No keyboard pop-up from dropdown taps

Never render a `searchable` `Select`/`MultiSelect` directly — use the shared
`NoKeyboardSelect`/`NoKeyboardMultiSelect` (`src/components/NoKeyboardSelect.tsx`),
which keep the native input `readOnly` until the dropdown opens. Don't use Mantine's
`readOnly` prop — it disables the whole dropdown.

**Department selects are never searchable** (short list; plain Select/MultiSelect
targets are buttons). Exception: the User-form Department field is a row of
toggleable `Badge`s — a Select's focused input focus-scrolls the modal spasmodically
on mobile.

## 1.2 UserSelectModal — the badge dialog

`UserSelectModal` (`src/components/UserSelectModal.tsx`) is a `Modal` listing sections
of toggleable badges with a search box on top:

- Typing removes non-matching options **immediately** — an option survives when its
  label, its extra `search` terms, **or its section label** match; emptied sections
  disappear.
- Callers pass `groups: PickerGroup[]` (render order) and
  `values: Record<sectionLabel, string[]>` and get `onConfirm(values)` back —
  **ids in, ids out**, so each caller keeps its own id domain.
- The draft lives in a child that mounts with the modal, so it re-seeds from `values`
  on every open (the FilterModalBody pattern).
- Sections carry the department tree: an id-keyed per-department section has a
  `depth` (0 = top level) and is rendered indented under its parent's section, so the
  roster reads as nested department blocks. **Department options** (each a department,
  not a user) keep their labels wrapped as normal badges; their nesting is shown
  **inside the label** as the full ancestor chain ("HQ › Logistics › Stores"),
  produced by `departmentPickerOptions`. A `depth` on such options is only an order
  marker — `sortOptionsInGroups` leaves them in tree preorder instead of
  re-alphabetizing. Depth is display-only — the draft/summary/merge helpers key by
  section label and option id, so nesting never changes a caller's id semantics.
- Every option renders through the shared `SelectableBadge` (the same keyboard-operable
  badge as the wizard and filter grid — **amber fill** when selected, gray light
  otherwise; selection is a color, not a glyph, §1.7). Options may carry
  `self: true`, which renders the amber "mine" treatment and a "(You)" suffix (the
  dashboard/parade Users filters mark the acting user).
- Multi-select section headers show the option count plus an **All / Clear** pair
  scoped to that section; the footer carries a global **Select all / Clear**. The
  controls are hidden in `single` mode (where one pick replaces the whole draft).
- There is **no dedicated "Selected" area** inside the dialog: picks are
  unmistakable in the pool (amber fill, §1.7) and the footer keeps a live
  "N selected" count — a second summary of the same draft was redundant chrome.
- The footer shows a dimmed **"N selected"** beside the global Clear / All-None pair,
  and the confirm button defaults to **"Done"** — the dialog both adds and removes, so
  an "Add"/"Select" label made users believe re-tapping a name added it again. Callers
  override only when a domain verb is clearer ("Check person"; the single-value
  department/parent pickers keep "Select").
- The `values` prop and every helper stay ids-in/ids-out; ownership of the id domain
  never changes.
- Pass `zIndex` when nested — the event wizard uses 300 over its z-250 dialog.
  (The filter dialog used to open one at 200; it now selects in its own panel, so
  nothing stacks over it — see [`dashboard-views.md`](dashboard-views.md) §1.2.)
- **`single` mode** (optional prop): for exactly-one-person picks (the Double Booking
  admin "check another person" target). Tapping any badge _replaces_
  the whole draft (one id across all sections; still re-seeded from `values` on each
  open) and Confirm is disabled while nothing is selected. Without it the modal keeps
  its free multi-select for participants/filters/KAH members.

## 1.3 Pure helpers

`src/lib/users/userSelect.ts` — unit-tested, I/O-free:

| Helper | Behavior |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `optionMatchesQuery` | fuzzy label match + case-insensitive `search` substring (via `search/fuzzy.ts`) |
| `sortOptionsInGroups` | keeps section order; sorts options by label — except sections whose options carry a `depth` (department rows in tree preorder), which keep the given order |
| `buildUserGroups` | groups a flat roster by department ("No department" last); when callers supply a `departmentSort` per user (the department's `sort_order`), sections follow the Settings → Departments order (flattened preorder) instead of alphabetical — sections without a rank sort alphabetically after the ranked ones. When callers also supply `departmentId` + `departmentParentId` per user (the department registry id and `calendars.parent_id`), the section is keyed by the department id and tagged with a `depth` — the number of ancestors that also have members in this picker — so nested departments render indented under their parent's section (a parent with no members is simply not shown, and its children sit at the depth of their nearest shown ancestor) |
| `departmentPickerOptions(rows)` | builds the options for a department-as-option list (wrapped badges / chip filters) from preorder `departmentTreeRows` (`roster/hierarchy.ts`); each option's label carries its **full ancestor chain** ("HQ › Logistics › Stores", via `departmentPathLabels`), top level = its plain name, and its `depth` is kept only as the "keep tree preorder, don't re-alphabetize" marker |
| `filterPickerGroups` | narrows fuzzily; keeps a whole section when its label matches; drops empties |
| `selectionByGroup` | seeds a draft from a flat selection |
| `removeInvitee` | removes one prefixed (`user:`/`dept:`) invitee key from a flat invitee list — the wizard chip's ✕ handler |
| `splitInvitees` / `mergeInviteeSelection` | split/merge the `user:<id>` / `dept:<id>` prefixed invitee list (keeps now-unlistable ids so edits don't drop them; nothing is auto-added by the helpers — a fresh create's form seeds the acting user as a participant, but that is `buildInitialValues`, not the picker) |

## 1.4 Callers

- **Event wizard's Participants step** — a `Departments` section whose badges carry
  the ancestor path (wrapped pills) + per-department user sections (id-keyed,
  indented under their parent); the form's `invitees` field keeps
  its `user:`/`dept:` prefixed shape.
- **Filter dialog groups** — Users on the dashboard + parade state carry
  `variant: "search"`, which since the two-level sheet means only
  **empty = no filter** (it is no longer a layout switch). Options may carry
  `department` to get per-department sections, `search` for extra matching, and
  `self` for the "(You)" suffix. Department sections order by the
  caller-provided `departmentSort` (the Settings → Departments sort order) and
  nest via `departmentId`/`departmentParentId`; the audit log's actors with no
  roster match fall into an unranked trailing "Other" section. The dialog renders
  **every** group — Users, Calendars, Event Types — as touch-sized checkbox rows
  (`SelectableRow`) under section headers with `n of m` counts, not as badges:
  see [`dashboard-views.md`](dashboard-views.md) §1.2. It shares this doc's option
  shape (`FilterOption`), section math (`filterPickerGroups`) and
  `AllNoneControls`; it does not use `SelectableBadge`, `PickerBadges` or
  `PickerTrigger`.
- **Double Booking scan target** — a `single`-mode `UserSelectModal` (department
  sections nested by tree depth, shortname `search`) replacing the page's original
  `NoKeyboardSelect` dropdown, since the roster is a large option list.
- **UserForm "Department access" add row** — a `single` `UserSelectModal` (Departments
  section of ancestor-path badges over the grantable rows) stages the department to
  grant; the role select + Add button below commit it. The form's own-department field
  is the same ancestor-path badge row.
- **Department create/edit "Parent department"** — a `single` `UserSelectModal` over
  the same option set as the old select ("No parent (top level)" first, then
  ancestor-path department badges), including a selectable "No parent (top level)"
  option (id `""`); self and descendants are still excluded.

## 1.5 File index & related docs

| File | Role |
| ------------------------------------- | ----------------------------------------- |
| `src/components/NoKeyboardSelect.tsx` | Keyboard-safe Select/MultiSelect wrappers |
| `src/components/UserSelectModal.tsx`  | The badge-dialog picker |
| `src/components/SelectableBadge.tsx` | Shared selectable badge — amber fill when selected (wizard + picker + filters) |
| `src/components/AllNoneControls.tsx` | Shared compact All/None (or All/Clear) pair |
| `src/components/PickerField.tsx` | The app-wide removable chip (`PickerChip`), its summary row (`PickerBadges`), the picker trigger/field, and the row-shaped `PickerFieldTrigger` |
| `src/lib/ui/picker.ts` | Pure trigger-label copy helpers |
| `src/lib/users/userSelect.ts` | Pure grouping/matching/merging helpers |
| `src/lib/filters/filterSections.ts` | Pure section state + All/None math |

Related docs:

- [`dashboard-views.md`](dashboard-views.md) — the Users filter that uses this.

## 1.6 PickerChip / PickerBadges / PickerField — the shared chip, summary & trigger

`UserSelectModal` is dialog-only: each consumer used to hand-roll its own "label row +
trigger button + summary of the current selection" around it. That markup now lives once
in `PickerField` (`src/components/PickerField.tsx`), with the badge row itself reusable
standalone as `PickerBadges` and one chip as `PickerChip`:

- **`PickerChip`** is **the app's one removable chip**: every removable pill in the app
  renders through it — the wizard's participant chips, the
  event search's recent searches and the audit log's applied filters — so a removal
  affordance is never painted outside the thing it removes. A `variant="light"` Badge on
  the shared `--c2-chip-height` (36px, `globals.css`) with the ✕ **inside** the chip's
  right section: a ≥22px `ActionIcon` (`.c2-picker-chip-remove`, visible focus ring on the
  brand ramp) named `Remove <label>` (`removeLabel` overrides it). `tt="none"` keeps
  free-text values (search terms, dates, action labels) in their natural case — the badge
  default (uppercase) suits people and department names. `onSelect` makes the label
  tappable (a recent search re-runs) while the ✕ stays a **sibling** control: the Badge
  root is a `div`, so the two buttons sit side by side instead of one nested in another.
- **`PickerBadges`** renders the picked options as `PickerChip`s from
  `items: PickerBadgeItem[]` (`{ key, label, color?, self?, srSuffix? }`). A `cap` shows a
  `+N` overflow badge instead of the tail; an `empty` node replaces the row when nothing is
  picked, and `self` uses the amber "mine" treatment with "(You)". With `onRemove`
  every visible chip carries the ✕ that removes that pick in place (the `+N` badge
  stays inert — §1.7). Every chip — removable or not, `+N` included — rides the
  app-wide interactive-chip height `--c2-chip-height` (36px, `globals.css`), the
  same height `SelectableBadge`, the folder container chips, the wizard's Type
  banner and the recent-location chips use, so every row of selectable/clickable
  user & department chips lines up. `size="compact"` drops the row to plain
  read-only Badges (≈20px, no `--c2-chip-height`): the chip rule is **36px =
  tappable/removable, plain Badge = read-only**, so a details surface that only
  displays names never paints fake tap targets. `srSuffix` appends an sr-only word
  to the chip's accessible name (e.g. "department") without touching the visual
  label. Pure presentation — callers resolve their own id domains into items.
- **`PickerTrigger`** is the shared trigger button: **Add** + `IconPlus` while nothing
  is picked, **Edit** + `IconPencil` afterwards; `triggerLabel` wins over the pair and
  `addLabel`/`editLabel` customize it. `size` (default `xs`, the wizard's row scale)
  and `className` let a chrome row resize it.
- **`PickerField`** composes the full affordance: an optional header (`label`, `count`
  suffix `(N)`, `description`) with the `PickerTrigger` pinned right, then
  `PickerBadges`.
- **`PickerFieldTrigger`** is the trigger for a picker that sits **in a control row**
  with no form label above it — Double Booking's scan target today. It renders the
  shared `.c2-field-trigger` recipe
  ([`desktop-responsive.md`](desktop-responsive.md) §1.6): icon + value + chevron,
  44px tall, brand outline while open, so it reads as the same control as the
  `TimeRangeSelect` next to it. Unlike `PickerTrigger` it never says Add/Edit — the
  value **is** the state (`Check someone` → `Name · Department`) — and `onClear` +
  `clearLabel` add the ✕ that returns the picker to its default. That ✕ is a
  **sibling** of the open button, never a descendant (nested buttons are invalid
  HTML): the picked state is a `div.c2-field-trigger` wrapping the open `<button>`
  (`.c2-field-trigger-main`, padding-free so the two halves look like one control)
  plus an `ActionIcon` on the shared ≥22px `.c2-picker-chip-remove` recipe. Pass
  `ariaLabel` when the visible value alone would lose meaning once another control
  names it (`Check someone — currently Name · Department`).

The modal itself stays with each caller — open state, `zIndex`, and the `onConfirm`
transform differ (prefixed invitees vs. flat member ids vs. FilterModal's staged draft
vs. `single`-mode target). Most consumers render through this component tree; the
UserForm grant picker uses a plain trigger `Button` because its value is staged for a
separate role + Add commit:

| Consumer | Field | Notes |
| -------- | ----- | ----- |
| Event wizard (Participants step) | `PickerField` | departments `accent`, explanatory description (participants can edit; a fresh create pre-selects the acting user; an event must keep ≥1 participant/department); chip ✕ removes one `user:`/`dept:` invitee via `removeInvitee` |
| KAH group form | `PickerField` | `Members (N)` count, "No members selected." empty; chip ✕ removes a member; field error renders below |
| Parade email form (Recipients) | `PickerField` | chip ✕ removes a recipient |
| Double Booking scan target | `PickerFieldTrigger` | one control at every width in the report head's `.c2-report-picker` slot: "Check someone" while scanning self, `Name · Department` once picked, ✕ returns the scan to the user's own schedule ([`user-clashes.md`](user-clashes.md) §1.8). The labelled stack + band-switched compact twin it replaced are gone |
| Department create/edit (Parent department) | `PickerField` | chip ✕ clears the parent to top level; empty text "No parent (top level)"; `triggerLabel="Select"` |
| UserForm (Department) | `PickerField` | single chip; ✕ clears the department ("Remove department"); `triggerLabel="Select"` |
| UserForm (Department to grant) | trigger `Button` | stages the department; role select + Add commit it — add-only by design, so its dialog keeps `confirmLabel="Add"` |
| Filter dialog (all groups) | — | **no longer a chip consumer** — its groups are rows in its own two-level sheet, so it renders neither `PickerBadges` nor `PickerTrigger` (§1.4, [`dashboard-views.md`](dashboard-views.md) §1.2) |
| Event search recent searches | `PickerChip` × N | not a picker — the row is the modal's own `.c2-chip-scroll`; tapping the label re-runs that query (`onSelect`), the ✕ forgets it; `tt="none"` (a query is free text) |
| Audit log applied filters | `PickerBadges` | not a picker — one chip per applied value (actors / actions / entity types / search / From / To); the ✕ drops just that value from the URL; `tt="none"` |
| Event detail modal (Participants) | `PickerBadges` | not a picker — `size="compact"` read-only badges; people first (self pinned with "(You)"), then tagged departments (`accent`, `srSuffix="department"`) in one merged row; `cap` + `+N` toggle |

## 1.7 Selection state & one-tap removal

The old picker hid its state at every layer: the trigger kept reading "Select +" after
people were tagged, the summary chips were inert, and the dialog's Confirm said
"Select"/"Add" as if it could only add — so users re-tapped names "to add them again"
(toggling them off) or opened the dialog hunting for a Remove button. The fix makes
selection state visible everywhere and removal one tap:

- **Option badges:** a selected `SelectableBadge` is unmistakable by **color** —
  brand-amber fill (`#FBC02D`) with near-black text in both schemes
  (`.c2-selectable-badge[data-selected]` in `globals.css`), unselected stays the
  gray light badge. Deliberately **not a check glyph**: the earlier reserved
  check slot shifted every unselected label right and sat off-center, and a
  color needs no reserved space. `aria-pressed` carries the state for AT and
  filled-vs-tint is a non-colour cue. Amber is also the "mine" colour, so a
  `self` badge keeps its accent ring + "(You)" suffix in both states — the
  amber fill simply replaces the cream tint while selected.
- **Trigger:** `PickerTrigger` says **Add** + `IconPlus` while nothing is picked and
  **Edit** + `IconPencil` afterwards — never a static "Select +" over a non-empty
  selection. Single-value pickers that read as fields (UserForm department, Department
  parent) keep an explicit `triggerLabel="Select"`.
- **Summary chips:** `PickerBadges onRemove` puts the ✕ (`ActionIcon`, ≥22px via
  `.c2-picker-chip-remove` in `globals.css`, visible focus ring on the brand ramp)
  **inside** every visible chip — never beside it, which is what the event search's recent
  searches and the audit log's applied-filter pills did before they moved onto
  `PickerChip` (§1.6); chips ride the shared 36px `--c2-chip-height` so the row
  stays even. The `+N` overflow badge stays **inert** — its hidden picks are removed
  inside the dialog, where they are named.
- **Inside the dialog:** no dedicated Selected area — picks show as amber
  badges in the pool itself, and the footer keeps a live "N selected" count
  beside Clear (§1.2).
- **Copy discipline:** group-level **All / None** (None = an explicit empty selection),
  search-group **All / Clear**, and the filter footer's **Reset filters** (back to role
  defaults) are three different actions with three names — never merge them.

The copy decisions live in pure helpers (`src/lib/ui/picker.ts`: `pickerTriggerLabel`,
`pickerChipRemovable`) and the removal math in `userSelect.ts`
(`removeInvitee`) — unit-tested. Removal UI never silently deletes an id the user cannot
see: summary chips resolve from the current option set (stale ids stay out of the
summary), while `mergeInviteeSelection` still preserves unlistable ids on commit.

