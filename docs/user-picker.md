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
- [1.6 PickerField / PickerBadges — the shared trigger & summary](#16-pickerfield--pickerbadges--the-shared-trigger--summary)

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
- Pass `zIndex` when nested — the event wizard uses 300 over its z-250 dialog;
  FilterModal uses 200.
- **`single` mode** (optional prop): for exactly-one-person picks (currently the
  Double Booking admin "check another person" target). Tapping any badge _replaces_
  the whole draft (one id across all sections; still re-seeded from `values` on each
  open) and Confirm is disabled while nothing is selected. Without it the modal keeps
  its free multi-select for invitees/filters/KAH members.

## 1.3 Pure helpers

`src/lib/users/userSelect.ts` — unit-tested, I/O-free:

| Helper                                    | Behavior                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `optionMatchesQuery`                      | case-insensitive label/`search` match                                                                                                    |
| `sortOptionsInGroups`                     | keeps section order; sorts options by label                                                                                              |
| `buildUserGroups`                         | groups a flat roster by department ("No department" last)                                                                                |
| `filterPickerGroups`                      | narrows by query; keeps a whole section when its label matches; drops empties                                                            |
| `selectionByGroup`                        | seeds a draft from a flat selection                                                                                                      |
| `splitInvitees` / `mergeInviteeSelection` | split/merge the `user:<id>` / `dept:<id>` prefixed invitee list (keeps now-unlistable ids so edits don't drop them; creator stays first) |

## 1.4 Callers

- **Event wizard's Invited Attendees step** — a flat `Departments` section + user
  sections; the form's `invitees` field keeps its `user:`/`dept:` prefixed shape.
- **FilterModal's `variant: "search"` groups** — Users on dashboard + parade state;
  options may carry `department` to get per-department sections, `search` for extra
  matching.
- **Double Booking admin target** — a `single`-mode `UserSelectModal` (department
  sections, shortname `search`) replacing the page's original `NoKeyboardSelect`
  dropdown, since the roster is a large option list.
- The admin **"On behalf of"** single-select stays a `NoKeyboardSelect`.

## 1.5 File index & related docs

| File                                  | Role                                      |
| ------------------------------------- | ----------------------------------------- |
| `src/components/NoKeyboardSelect.tsx` | Keyboard-safe Select/MultiSelect wrappers |
| `src/components/UserSelectModal.tsx`  | The badge-dialog picker                   |
| `src/components/PickerField.tsx`      | Presentational trigger + summary layer    |
| `src/lib/users/userSelect.ts`         | Pure grouping/matching/merging helpers    |

Related docs:

- [`dashboard-views.md`](dashboard-views.md) — the Users filter that uses this.

## 1.6 PickerField / PickerBadges — the shared trigger & summary

`UserSelectModal` is dialog-only: each consumer used to hand-roll its own "label row +
trigger button + summary of the current selection" around it. That markup now lives once
in `PickerField` (`src/components/PickerField.tsx`), with the badge row itself reusable
standalone as `PickerBadges`:

- **`PickerBadges`** renders the picked options as `variant="light"` badges from
  `items: PickerBadgeItem[]` (`{ key, label, color? }`). A `cap` shows a `+N` overflow
  badge instead of the tail; an `empty` node replaces the row when nothing is picked.
  Pure presentation — callers resolve their own id domains into items.
- **`PickerField`** composes the full affordance: an optional header (`label`, `count`
  suffix `(N)`, `description`) with the `IconPlus` trigger button (`triggerLabel`,
  default "Select") pinned right, then `PickerBadges`.

The modal itself stays with each caller — open state, `zIndex`, and the `onConfirm`
transform differ (prefixed invitees vs. flat member ids vs. FilterModal's staged draft
vs. `single`-mode target). Every consumer of `UserSelectModal` renders through this
component tree today:

| Consumer | Field | Notes |
| -------- | ----- | ----- |
| Event wizard (Invited Attendees step) | `PickerField` | creator badge `brand`, departments `accent`, explanatory description |
| KAH group form | `PickerField` | `Members (N)` count, "Choose" trigger, "No members selected." empty; field error renders below |
| Double Booking admin target | `PickerField` | single `brand` chip "Name · Department"; self-scan shows the empty text instead |
| `FilterModal` search groups | `PickerBadges` only | `cap={5}` + `+N`, "All {label}" empty — the group's own heading/label row is FilterModal's |

