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
positioning (pinned just inside the grid's own edges, vertically centered on its
**on-screen visible slice**, always visible while the grid is shown,
intentionally subdued secondary chrome lighter than the date-nav chevrons):

- **`GridPanControls`** — the **Week (D)** grid renders its own instance: a
  left/right pair of edge-anchored buttons (one per scrollable edge).
- **`GridNavControls`** (`src/components/GridNavControls.tsx`) — the **Day/Week (H)**
  grids use one right-edge control cluster: the **timeline zoom** in/out pair on
  top, a divider, then the right pan arrow; a single left-edge pan arrow stays
  edge-anchored on the left so "scroll left" still reads from the left edge (see
  [`dashboard-views.md`](dashboard-views.md#15-timeline-zoom-day-and-week-h)).
  The cluster hangs from its **bottom edge**, so the right pan arrow's center sits
  on the visible-slice center — vertically aligned with the left pan arrow — and
  the zoom pair's slot above does not depend on `canScrollRight`, so nothing
  shifts when the arrow appears or disappears while panning. Unlike the pan
  arrows, the zoom pair renders whenever the schedule grid is shown — zoom is
  useful even when the grid fits without overflowing.

**Positioning: `position: fixed`, statically anchored — no scroll tracking.**
The buttons are fixed to the viewport and their anchor — the grid's visible-slice
center plus the 8px edge insets (`anchor.getBoundingClientRect()` clamped to
`[0, innerHeight]`) — is measured **once** when the view loads, and re-measured
only on window resize or anchor size change (`ResizeObserver`: breakpoint flips,
sidebar collapse, grid load). There is **no scroll listener at all**, so the
buttons hold perfectly still at the calendar's visible-area center while the
page scrolls and never leave the screen.

Three earlier approaches were tried and rejected:

- **React state per scroll event**: the offsets update landed a frame (or more)
  behind the scroll (continuous-event updates are scheduled, not applied in the
  handler), so the fixed buttons visibly wobbled while scrolling up/down —
  worse on mobile, where `innerHeight` also changes as the URL bar collapses.
- **Pure-CSS `position: sticky` rail**: a sticky element can only be pinned to
  one edge of the scrollport and is clamped to its containing block, so near
  the grid's top/bottom — and across the whole range for grids shorter than the
  viewport — the rail rode with the grid and the buttons drifted from the
  visible-slice center and eventually scrolled out of view with it.
- **rAF-synced tracking (direct DOM writes)**: kept the exact visible-slice
  center per frame, but on grids shorter than the viewport the buttons travelled
  toward the screen edge as the calendar scrolled out, and the per-frame
  repositioning stuttered when the browser coalesced scroll frames.

Static anchoring wins because the buttons' position is independent of the scroll
position: a tall grid (its visible slice is the on-screen strip) keeps them at
the visible-area center forever; a grid shorter than the viewport leaves them at
the load-time center instead of chasing the calendar.

## 1.3 Wiring into the grids

| Grid | Wiring |
| ---- | ------ |
| Day / Week (H) | through the schedule views' `scrollAreaProps`: `viewportProps` + a `viewportRef` merged with the ruler-sync ref — keep `scrollAreaProps` identity stable across scroll frames |
| Week (D) | through its own `ScrollArea` |

The button components are rendered as **siblings of the anchor element** —
the Day/Week (H) content `Box` (`weekBoxRef`) and the Week (D) `Paper`
(`rootRef`) — and receive it as `anchorRef`, which the scroll handler measures
(see §1.2).

## 1.4 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/ui/gridPan.ts` | `useGridPan` hook (drag, edge state, `panTo`) |
| `src/components/GridPanControls.tsx` | Week (D) edge pan buttons |
| `src/components/GridNavControls.tsx` | Day/Week (H) right-edge cluster: zoom +/− + right pan, plus left-edge pan |

Related docs:

- [`dashboard-views.md`](dashboard-views.md) — the three wide grids this serves.
