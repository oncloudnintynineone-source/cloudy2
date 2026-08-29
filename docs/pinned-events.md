# 1. Pinned Events

A header pin button (all pages, beside the light/dark toggle) opens a centered Modal
listing every explicitly-pinned upcoming event, with an amber count badge that stays
fresh across mutations.

## Table of contents

- [1.1 Pinning an event](#11-pinning-an-event)
- [1.2 The server read](#12-the-server-read)
- [1.3 Opening an event: deep links](#13-opening-an-event-deep-links)
- [1.4 The count badge & refresh events](#14-the-count-badge--refresh-events)
- [1.5 Panel state & components](#15-panel-state--components)
- [1.6 File index & related docs](#16-file-index--related-docs)

## 1.1 Pinning an event

- The wizard's Invited Attendees step carries a **"Pin this event" switch** (any
  user) that sets the `pinned` notes flag. Tagging a whole department no longer pins
  by itself.
- The panel shows a **rolling today → 3-months window** (today through the end of the
  month two months out, matching the month-grid reads), **ignoring the dashboard's
  current filters**.

## 1.2 The server read

`src/lib/events/pinned.ts` (server actions):

- `fetchPinnedEvents()` month-reads **all** calendars through the events cache
  (`fetchRangeEvents`) and resolves display-ready data: titles rendered through the
  event-title template and department names resolved.
- Panel titles render through the **`pinned` template-assignment target**
  (Settings → Templates → View assignments), falling back to the master template when
  unassigned.
- The pure `selectUpcomingPinnedEvents` (`pinnedSelect.ts`, unit-tested) drops events
  already ended and sorts by start.
- `countPinnedEvents()` shares the same read but **skips title/name resolution**, so
  the badge stays cheap.

## 1.3 Opening an event: deep links

Tapping an event closes the panel and navigates to
`/dashboard?date=YYYY-MM-DD&event=<groupId>`, where the dashboard's `?event=` deep
link auto-opens the event's details modal (Edit / Duplicate / Delete per the usual
`isAdmin || creator` rule):

- `eventId` is the group id shared by all department copies of the event; legacy
  events without one fall back to the date alone.
- Opening from a non-dashboard page navigates to the dashboard first (the shell stays
  mounted, so the modal survives).

## 1.4 The count badge & refresh events

The header button carries an amber count badge, refreshed:

- on mount, on panel close, on tab refocus, and
- after every event create/update/delete via the
  `cloudy2:pinned-events-changed` window event (`PINNED_EVENTS_CHANGED_EVENT`,
  dispatched at the dashboard's `onDeleted` / form `onDone`).

## 1.5 Panel state & components

Open/close state lives in `AppShellShell` and rides `PinnedPanelContext`
(`src/lib/ui/pinnedPanel.ts`) — `openPanel(originRect)` carries the header button's
bounding rect so the modal zooms out of / back into it (the app's standard grow/shrink
animation). The Modal itself is `src/components/PinnedEventsPanel.tsx`.

## 1.6 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/events/pinned.ts` | `fetchPinnedEvents` + `countPinnedEvents` |
| `src/lib/events/pinnedSelect.ts` | Pure upcoming-window selection (unit-tested) |
| `src/lib/ui/pinnedPanel.ts` | `PinnedPanelContext` + change event name |
| `src/components/PinnedEventsPanel.tsx` | The panel Modal |

Related docs:

- [`events-cache.md`](events-cache.md) — the month reads behind the panel.
- [`event-lifecycle.md`](event-lifecycle.md) — the title templates (incl. the
  `pinned` view assignment).
- [`ui-state.md`](ui-state.md) — pinned dashboard view tabs (a separate feature).
