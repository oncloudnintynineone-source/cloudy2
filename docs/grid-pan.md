# 1. Wide-grid horizontal pan

The dashboard's Day/Week (H)/Week (D) grids are wider than the viewport (or become
so once their zoom is raised past fit), and the
Month grid becomes wider than the viewport once its fit-width zoom is raised past
100%, but Mantine hides the native scrollbars and its own 4px bar sits at the
bottom of a table that is usually taller than the screen (the page scrolls
vertically, not the area) — without extra affordances there is no discoverable
horizontal pan on any breakpoint. `useGridPan` + `GridNavControls` remedy this for
all the grids at every breakpoint.

## Table of contents

- [1.1 useGridPan — drag + edges](#11-usegridpan--drag--edges)
- [1.2 GridNavControls — the edge buttons](#12-gridnavcontrols--the-edge-buttons)
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
  schedule views' `scrollAreaProps`, which must not churn per frame. Its style
  also sets `overflow-anchor: none`: the browser's own scroll anchoring would
  otherwise adjust the offset (asynchronously, after paint) while a zoom changes
  the content width, fighting the JS re-anchor tween
  (`src/lib/ui/scrollTween.ts` — see [`dashboard-views.md`](dashboard-views.md#17-timeline-zoom-day-week-h-and-week-grid)
  §1.7 "Animated zoom").

Drag and buttons are always enabled whenever the viewport overflows; native touch pan
and Shift+wheel keep working alongside.

## 1.2 GridNavControls — the edge buttons

`GridNavControls` (`src/components/GridNavControls.tsx`) renders circular grey
filled-triangle pan buttons that call `panTo`, plus the zoom in/out pair(s), as one
right-edge control cluster. Every wide grid uses it: the Day/Week (H) and Week (D)
grids carry the **single-axis** cluster (the zoom in/out pair on top, a divider,
then the right pan arrow; a single left-edge pan arrow stays edge-anchored on the
left so "scroll left" still reads from the left edge), the **Month** grid's
fit-width zoom uses the same cluster with its own zoom levels (`zoomMin`/`zoomMax`)
and its own pan instance — its pan arrows appear only once a zoom level overflows
the viewport — and the **Week (Grid)** view's two-axis zoom uses the same cluster
split around the arrow: the **columns** pair above the right pan arrow and the
**rows** pair below (each behind its own divider), anchored so the arrow's center
sits on the grid's **visible-slice center**, like the other clusters (§1.7 of
[`dashboard-views.md`](dashboard-views.md#17-timeline-and-column-zoom-day-week-h-week-d-and-week-grid)).
For the single-axis clusters the widget hangs from its **bottom edge**, so the
right pan arrow's center sits on the visible-slice center — vertically aligned
with the left pan arrow — and the zoom pair's slot above does not depend on
`canScrollRight`; in the two-axis cluster the arrow slot and its dividers are
likewise reserved (hidden, space kept) when the grid fits without
overflowing. Either way nothing shifts when the arrow appears or disappears
while panning. Unlike the pan
arrows, the zoom pair(s) render whenever the schedule/grid is shown — zoom is
useful even when the grid fits without overflowing.

**Positioning: `position: fixed`, statically anchored — no scroll tracking.**
The buttons are fixed to the viewport and their anchor — the grid's visible-slice
center plus the 8px edge insets (clamped to `[0, innerHeight]`) — is measured
with `layoutRect` (`src/lib/ui/layoutRect.ts`), which returns **transform-free**
layout geometry rather than `getBoundingClientRect`. That matters because the
Week (D) and Month & Agenda anchors live inside the dashboard's transiently
transformed grid-slide wrapper: the visual rect captured mid-slide shifted the
`right` inset (left or right, by the slide direction), leaving the controls
displaced until a resize. The anchor is measured when the view loads and
re-measured on window resize, an anchor size change (`ResizeObserver`: breakpoint
flips, sidebar collapse, grid load), and a `layoutKey` flip (each caller passes
its breakpoint + chrome measurement). `measure()` reads the anchor ref fresh on
every pass, so a remounted anchor is re-measured rather than a detached node.
There is **no scroll listener at all**, so the buttons hold perfectly still at
the calendar's visible-area center while the page scrolls and never leave the
screen. The left/right controls are clamped to
the **anchor's own midpoint** (not the viewport's) so a narrow grid can't push
them off-screen or onto each other; full-width grids have their midpoint at the
viewport center, so this only changes behavior for the Month & Agenda view's
Month pane, which lives in the left portion of the viewport — clamping to the
viewport center would freeze its zoom/pan cluster mid-screen once the pane's
right edge crossed it (the pane's own right edge is where it belongs).

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
| Week (D) | through its own `ScrollArea` (the matrix view owns its `useGridPan` instance, pinch and zoom) |
| Month (zoomed) | through the MonthView's own `ScrollArea` `scrollAreaProps` (its pan state is a separate `useGridPan` instance, `monthPan`) |
| Week (Grid) | through the WeekView's `ScrollArea` `scrollAreaProps`; that viewport is **also the grid's vertical scroller** (the grid is viewport-bounded — see [`dashboard-views.md`](dashboard-views.md#17-timeline-and-column-zoom-day-week-h-week-d-and-week-grid) §1.7), so its `useGridPan` instance (`gridWeekPan`) shares the element with the internal vertical scroll |

The grids that support pinch-to-zoom pass `touch-action: pan-x pan-y` into
`useGridPan` (the viewport style): native panning keeps working, but the browser
no longer page-pinches over the grid, so the two-finger gesture belongs to
`usePinchZoom` ([`dashboard-views.md`](dashboard-views.md#17-timeline-and-column-zoom-day-week-h-week-d-and-week-grid) §1.7).

The button components are rendered as **siblings of the anchor element** —
the Day/Week (H)/Month content `Box` (`weekBoxRef`) and the Week (D) `Paper`
(`rootRef`) — and receive it as `anchorRef`, which the scroll handler measures
(see §1.2).

## 1.4 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/ui/gridPan.ts` | `useGridPan` hook (drag, edge state, `panTo`) |
| `src/lib/ui/layoutRect.ts` | `layoutRect` — transform-free element rect for the control anchors |
| `src/components/GridNavControls.tsx` | Day/Week (H) + Week (D) + Month right-edge cluster: zoom +/− + right pan, plus left-edge pan |

Related docs:

- [`dashboard-views.md`](dashboard-views.md) — the grids this serves (§1.7 covers
  the zooms that make the grids pan; §1.8 the Month fit-width zoom).
