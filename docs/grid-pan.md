# 1. Wide-grid horizontal pan

The dashboard's Day/Week (H)/Week (D) grids are wider than the viewport, but Mantine
hides the native scrollbars and its own 4px bar sits at the bottom of a table that is
usually taller than the screen (the page scrolls vertically, not the area) — without
extra affordances there is no discoverable horizontal pan on any breakpoint.
`useGridPan` + `GridPanControls` remedy this for all three grids at every breakpoint.

## Table of contents

- [1.1 useGridPan — drag + edges](#11-usegridpan--drag--edges)
- [1.2 GridPanControls — the edge buttons](#12-gridpancontrols--the-edge-buttons)
- [1.3 Wiring into the grids](#13-wiring-into-the-grids)
- [1.4 File index & related docs](#14-file-index--related-docs)

## 1.1 useGridPan — drag + edges

`useGridPan()` (`src/lib/ui/gridPan.ts`) wraps Mantine's `useScroller` for the drag
mechanics only and adds its own edge tracking:

- **Drag-to-pan** via `useScroller({ draggable: true })`; a >5px drag suppresses the
  trailing click, so event/slot clicks survive.
- **Edge state** (`canScrollLeft`/`canScrollRight`) is tracked on element **attach**,
  not mount: the `viewportRef` callback disposes the previous node's listeners itself
  (Mantine/floating-ui merging layers call callback refs with null on detach but drop
  any returned cleanup) and wires a passive `scroll` listener + `ResizeObserver`. The
  grids remount per view switch / skeleton, so a one-shot mount listener (what
  `useScroller` does) would miss the container and keep stale edges.
- **`panTo(edge)`** smooth-scrolls ~90% of the visible width (min 120px) — the
  built-in 200px step is far too shallow for a week grid that is 12,000+ px wide.
- **Cursor** is driven from React (grab/grabbing), never `useScroller`'s inline
  writes, so a re-render mid-drag can't blank it.
- `viewportProps` has **stable identity across scroll frames** — required by the
  schedule views' `scrollAreaProps`, which must not churn per frame.

Drag and buttons are always enabled whenever the viewport overflows; native touch pan
and Shift+wheel keep working alongside.

## 1.2 GridPanControls — the edge buttons

`GridPanControls` (`src/components/GridPanControls.tsx`) renders circular grey
filled-triangle buttons that call `panTo`. Two components share the same
fixed-position / visible-slice tracking (pinned just inside the grid's own edges,
vertically centered on its **on-screen visible slice**, re-measured on resize +
page scroll, hidden when the grid scrolls out of view, intentionally subdued
secondary chrome lighter than the date-nav chevrons):

- **`GridPanControls`** — the **Week (D)** grid renders its own instance: a
  left/right pair of edge-anchored buttons (one per scrollable edge).
- **`GridNavControls`** (`src/components/GridNavControls.tsx`) — the **Day/Week (H)**
  grids use one right-edge control cluster: the **timeline zoom** in/out pair on
  top, a divider, then the right pan arrow; a single left-edge pan arrow stays
  edge-anchored on the left so "scroll left" still reads from the left edge (see
  [`dashboard-views.md`](dashboard-views.md#15-timeline-zoom-day-and-week-h)).
  Unlike the pan arrows, the zoom pair renders whenever the schedule grid is shown
  — zoom is useful even when the grid fits without overflowing.

## 1.3 Wiring into the grids

| Grid | Wiring |
| ---- | ------ |
| Day / Week (H) | through the schedule views' `scrollAreaProps`: `viewportProps` + a `viewportRef` merged with the ruler-sync ref — keep `scrollAreaProps` identity stable across scroll frames |
| Week (D) | through its own `ScrollArea` |

## 1.4 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/ui/gridPan.ts` | `useGridPan` hook (drag, edge state, `panTo`) |
| `src/components/GridPanControls.tsx` | Week (D) edge pan buttons |
| `src/components/GridNavControls.tsx` | Day/Week (H) right-edge cluster: zoom +/− + right pan, plus left-edge pan |

Related docs:

- [`dashboard-views.md`](dashboard-views.md) — the three wide grids this serves.
