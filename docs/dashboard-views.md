# 1. Dashboard views & filters

The Calendar dashboard (`/dashboard`) renders one of the seven event-view
**kinds** (Month / Week (H) / Week (D) / Week (Grid) / Day / Agenda /
Month & Agenda) over the
shared server-side events cache ([`events-cache.md`](events-cache.md)). The
dashboard does **not** show one fixed instance of each kind: the user builds an
on-demand set of **views (tabs)** — one per-account row per tab (kind + user
name + strip order + that tab's own filter state), stored server-side in
`user_dashboard_views` (`src/lib/dashboardViews`). This document covers the tab
inventory & management, the filters (one button + modal, scoped per tab), the
custom Week (D) matrix — the one view no Mantine Schedule component can render —
the Month & Agenda split (side by side), the per-view "mine" and
external-entry highlights, and the Day / Week (H) timeline zoom plus the Month
grid's fit-to-width zoom.

## Table of contents

- [1.1 View inventory & tab management](#11-view-inventory--tab-management)
- [1.2 Filters](#12-filters)
- [1.3 Week (D): the custom week matrix](#13-week-d-the-custom-week-matrix)
- [1.4 Data flow shared by all views](#14-data-flow-shared-by-all-views)
- [1.5 My-entry highlight](#15-my-entry-highlight)
- [1.6 External-event highlight](#16-external-event-highlight)
- [1.7 Timeline zoom (Day, Week (H) and Week (Grid))](#17-timeline-zoom-day-week-h-and-week-grid)
- [1.7.1 Week (Grid) all-day overflow](#171-week-grid-all-day-overflow)
- [1.8 Month-grid zoom (fit-to-width)](#18-month-grid-zoom-fit-to-width)
- [1.9 Month & Agenda](#19-month--agenda)
- [1.10 File index & related docs](#110-file-index--related-docs)

## 1.1 View inventory & tab management

The renderer kinds (`DASHBOARD_VIEW_KINDS`, `src/lib/dashboardViews/views.ts`):

| Kind | Label | Renderer |
| ---------- | -------- | ---------------------------------------------------------------------------------------- |
| `dual` | Month & Agenda | Month grid + Agenda list side by side, resizable (§1.9) |
| `month` | Month | Mantine calendar month grid (natural 4–6 weeks — see [`events-cache.md`](events-cache.md)) |
| `week` | Week (H) | Mantine Schedule, hour columns per resource row |
| `weekv2` | Week (D) | custom week matrix (§1.3) |
| `weekgrid` | Week (Grid) | Mantine Schedule `WeekView`, conventional 7-day grid (time on the vertical axis; §1.7) |
| `schedule` | Day | Mantine Schedule, single day per resource row |
| `agenda` | Agenda | list view |

The `DASHBOARD_VIEW_KINDS` array's order is the **type-picker display order**
(Month & Agenda first, then Month, …); it is not a default — a new account is
seeded with a single "Month" tab.

**Week start.** A per-account preference (`user_preferences.week_start`, set
from the profile menu's **Preferences** dialog — [`ui-state.md`](ui-state.md)
§1.2.2) chooses whether every week/month grid opens on **Monday** (default) or
**Sunday**. It drives Mantine's `firstDayOfWeek` on the Month/Week (H)/Week
(Grid) views, the pinned weekday-initials strip, and the `requiredMonths` fetch
set through `weekDays`/`monthGridRows`/`monthGridMonths`
(`src/lib/events/datetime.ts`); because it changes which months a view depends
on, the dashboard snapshot version bumps when it is introduced.

Mobile-month is the sub-`lg` rendering of the `month` kind. Tabs are **not**
the kinds themselves: each `user_dashboard_views` row binds one of these kinds
to a user-chosen **name**, a per-user `sortOrder`, and that tab's own filter
overrides (see `src/db/schema.ts`). **Duplicates of the same kind are allowed**
(two "Agenda" tabs with different names/filters), so a tab's **UUID is its
identity** — carried in the URL as `?view=<tab id>`; a legacy `?view=<kind>`
string maps to the first tab of that kind.

- **Seed**: `getDashboardViews` reads the account's tabs first and only when
  that read is empty calls `ensureDefaultDashboardView` to create one "Month"
  tab (mutex-guarded on the `user_preferences` row so racing requests can't
  double-insert), then re-reads. The read-first order keeps the common path
  free of the seed transaction.
- **Add view** has two entry points, both opening the same quick **Add-view
   dialog** (the shared **seven-kind picker** `ViewTypePicker.tsx` rendered in
  its **thumbnail-grid** variant — one wireframe SVG preview per kind, from
  `viewThumbnails.tsx` — plus a name; the default name follows the chosen kind
  until edited; the dialog anchors initial focus to a visually hidden top
  element via `FocusTrap.InitialFocus` rather than the Name field, so it always
  opens scrolled to the top and never pops the mobile keyboard on open):
  - the strip's **`+` button at the end of the scrolling tab strip** (the
    strip's last item, shown for accounts that own stored views; tooltip "Add
    view"). Because it scrolls with the strip it can sit off-screen on a long
    strip. Desktop (`lg`+) only — below `lg` the mobile view menu carries it;
  - the **Manage-views modal**'s compact **Add view** button at the top, so
    creation is reachable from the always-pinned gear too (and, on mobile, from
    the view menu's **Add view** entry).
  Creating appends the tab and navigates to it; the new id is unknown to the
  held tab list (the request key `viewId|months` is definition-blind), so the
  switch forces a server re-read and the tab appears without a Force refresh.
- **Manage views** (a settings **gear** to the RIGHT of the strip, outside the
  horizontal scroll area — so the scroll set ends before it; tooltip "Manage
  views"; desktop `lg`+ only, on mobile it is the view menu's **Manage views**
  entry) opens a **centered modal** (`EditViewsModal.tsx`, sharing the app's
  **touch-friendly manage-row recipe** — see `src/components/reorderUpDown.tsx`)
  listing the created tabs as a **vertical list**. Each row shows the view's
  **kind icon + name**, with a dimmed **kind label** underneath **only when
  the name is custom** (a default-named tab already reads as its kind, so the
  label would just repeat the name). The active tab is marked with a thin
  **accent left border** on the row (quiet — no badge). Row actions:
  - **↑/↓** arrows reorder (commits `reorderDashboardViews`, which renumbers
    every row in a transaction — the clicked arrow shows an inline spinner while
    it works; the row's outward arrow is disabled at the list's ends). They use
    `ReorderUpDown`'s `variant="subtle"` here, so the dense row isn't a wall of
    bordered boxes. With the `reorderDrag` feature flag a **drag handle** can
    join or replace the arrows depending on the mode (`drag` default / `arrowsDrag`
    / `arrows`); a drop commits `reorderDashboardViews` too — see
    [`reorder.md`](reorder.md);
  - a **pen** (Edit, subtle) opens a single **Edit view** dialog with the name
    and the seven-kind picker — one place for both, replacing the old separate
    inline rename field and Change-type modal. The tab keeps its id, strip order
    and stored filters; a name that is still the old kind's default label follows
    to the new kind's default (a custom name is kept; the rule is applied
    server-side by `changeDashboardViewKind`, and a custom name typed in the
  dialog is applied after the kind so it always wins). Changing the **active**
  tab's type re-navigates to the same id under its new kind, so the tab-switch
  period rules below apply (Month → anchored starts today; anchored → Month
  keeps the month) — and because the request key (`viewId|months`) is
  definition-blind, the same id would otherwise look already covered, so the
  switch also forces a server re-read with the target period (the grid reloads
  in place instead of waiting for a Force refresh); editing an inactive tab
    just refreshes the list. This dialog's picker uses the same **thumbnail-grid**
    variant as the Add-view dialog — choosing a type is the same decision in both
    places (the row being edited's own kind is shown dimmed with "(current)").
    The edit is applied **optimistically**: the action returns the updated tab and
    `applyViewTab` patches the held snapshot, so the strip and this list repaint
    in the same frame, then the usual re-read reconciles against the server;
  - a **trash** (subtle red) deletes behind a nested `size="sm"` confirm (the
    last tab can't be deleted — its trash is disabled; deleting the active tab
    navigates to the first remaining and forces a re-read, so the deleted row
    can't linger behind a data-equivalent local swap).
  Two ~40px actions plus the chevron pair
  lead each row, so **below `lg` each row reflows to two lines**: the kind icon +
  name lead on the first, and the controls sit together on a second left-aligned
  line; at `lg`+ the row keeps its single line. The Edit dialog also carries the per-view
  **Filters** entry point: an **Edit
  filters…** button closes the modal, switches to that view and opens its filter
  dialog (the dashboard's one per-view filter UI — see §1.2). Filters resolve
  server-side per tab, so the dialog opens once the target tab is the active view
  (a preloaded tab resolves immediately). The old **pin/unpin** affordance
  and its star UI are gone — ordering is fully user-controlled. Tabs themselves
  are **content-sized** — each shrink-wraps its label (so the active underline
  hugs the text), they never stretch to fill the row, and a long set overflows
  into natural horizontal scrolling.
- **All-views jump list** (a chevron button between the Add-view button and the
  Manage-views gear, only when the account has more than one tab): for users with many tabs
  the overflowed strip is a long horizontal scroll to reach a specific view, so
  the chevron opens a `Menu` popover listing **every** tab in strip order —
  kind icon + name, the active tab ticked — for a one-tap `switchTab` without
  scrolling the strip.
- **Mobile view menu (below `lg`).** The whole tab strip row — tabs, the `+`
  Add-view button, the All-views chevron and the Manage-views gear — is dropped
  below `lg` to save a full row of sticky chrome. In its place the **floating
  control pill carries one compact 36px circular view-menu button** beside the
  filter and date buttons, so the control set is unchanged. It is a generic
  four-squares `IconLayoutGrid` deliberately distinct from the FAB cluster's
  step chevrons, the filter funnel and the calendar-date icon (the active
  view's kind icon would clash with the adjacent date-picker calendar).
   Tapping it opens a `Menu` whose dropdown is exactly the desktop All-views
   list (every tab, kind icon + name, active row ticked — and each row mirrors
   the desktop tab's per-view load state: not-loaded faded, loading shows a
   small amber spinner beside the tick; `DashboardViewMenuItem`,
   [loading-transitions.md](loading-transitions.md) §1.13.2) followed by a
   divider and **Add view** / **Manage views** entries (the latter two only for
   accounts that own stored views). It is icon-only: the active view's name
   rides the button's accessible name (`Calendar view: <name>`) and its
   tooltip, keeping the period label the pill's flexible element — the name
   itself is shown on its own line (see below). The dropdown opens **upward**
   (`position="top-end"`): the pill floats inset 16px at the bottom below
   `lg` (see the floating-control-pill bullet below). At `lg` and up the
   button is hidden and the strip row returns unchanged.
- **Mobile view indicator (below `lg`).** Because the strip row is dropped under
  `lg`, the active view would otherwise be *announced* (the view-menu trigger's
  accessible name, plus the live region's `"<view> view, <period>"`) but never
  *shown* — so on a phone nothing on screen said which view you were in. A
  **thin dimmed text line** (`size="xs"`, `fw={500}`, `c="dimmed"`, `ta="center"`,
  `lineClamp={1}`) naming the active view therefore owns the **top sticky strip
  below `lg`**: the chrome box that holds the tab strip + nav row at `lg`+
  shrinks to just this line (block padding trimmed, bottom divider,
  `c2-glass-surface`), pinned under the app header while the grid scrolls
  beneath it (`hiddenFrom="lg"`, so `lg`+ is unchanged — there the active tab's
  underline says it). It is **centered** on the screen. It reads
  **`shownTabName`**, the account's
  **own view name** (e.g. "Ops Week") and never the built-in kind label
  (`DASHBOARD_VIEW_KIND_LABELS`), from the same optimistic chrome the trigger
  and the announcement use — so it moves the instant a tab is tapped, ahead of
  the grid's data. It is **passive**: not a control, so it adds no focusable
   element and its `title` is only a hover fallback for a truncated name. Its
   measured height is `topChromeHeight` below `lg`: the pinned grid strips dock
   under it and the viewport-height grids subtract it (the bottom pill/FAB rows
   only overlay the bottom edge — see the floating-control-pill bullet). It
   deliberately does **not** surface per-tab load state (see
  [`loading-transitions.md`](loading-transitions.md) §1.13.2, a `lg`-only
  affordance).
- **Mobile tab-switch entrance (below `lg`).** The grid swipe (WAAPI on
  `gridSlideRef`, `DashboardView.tsx`) normally slides the incoming grid in from
  the side the target sits on — but below `lg` the tab strip is gone, so the
  strip-order side metaphor has nothing on screen to match. A **tab switch**
  there instead plays the app's reveal entrance (fade + 8px rise, like
  `c2-page-in`); **date moves keep the horizontal swipe** at every width (the
  chevrons carry the direction on mobile too).
- **Floating control pill (below `lg`).** The sticky chrome **splits** below
  `lg`: a **thin view-name strip stays pinned at the top** under the app
  header (see the mobile-view-indicator bullet), and the date controls move to
  **two floating rows at the bottom** (thumb-zone reach): the frosted
  **control pill** (`.c2-control-pill`, an `Affix` inset **16px from the
  viewport edges** — `left: 16, right: 16`, the same clearance as the FAB
  toolbar) sits **bottom-most** with the period label on the **left** and the
  **circular** search / filter / date / view-menu / fullscreen buttons on the
  **right** (the search circle is the mobile trigger, used below `lg`; at
  `lg`+ the shell header's "Search events" button is the trigger; both open
  the shell-owned modal through
  `SearchPanelContext`, §1.9 of [`event-search.md`](event-search.md))
   (the fullscreen button is `FullscreenButton`, the same inline toggle the
   floating lg-only `FullscreenToggle` uses); above it floats the
   **FAB row** — pinned **edge-to-edge** so it has a measurable width, with the
   `[< | >]` **period-step
   pill** (`.c2-period-pill`, sized by its 56px chevron circles), then the
    **Quick-links circle button** (`c2-glass-fab--accent`, amber —
    shown only when the org has links) and the **New-event circle button**
    (`c2-glass-btn` + `c2-glass-fab--brand` — the same brand-blue tint as the lg
    nav-row button — + `c2-glass-btn--bordered`, the grey hairline ring matching
    the pill containers) parked on the **right**. Every control is a **56px
    circle** (the step pill hugs its chevron circles, so the whole row is one
    height). When the event wizard is **minimized**, the draft docks as a chip on the
    row's **left** (`EventDraftChip`, §1.4.3 of
    [`event-lifecycle.md`](event-lifecycle.md)) — the only `flex: 1` item, so it takes
     exactly the space the fixed controls leave. On phones too narrow for even the
     44px icon chip the **New-event circle gives way** to it (the chip already carries
     the create/resume action), so the row never clips off the edge. The row sits at

   `bottom: calc(--app-floating-bottom-offset + pillH + 12px)`. All ride the
   same frosted treatment (`c2-glass-surface`) with pill/circle radius +
   hairline edge, so grid content scrolls *under* them (the row wrapper is
   `pointer-events: none` and only the controls re-enable it, so the empty stretch of
   the edge-to-edge row never swallows taps on the grid). The pill fades + rises in on
  first paint (`c2-glass-enter`; the FAB row via `c2-fab-cluster`) — see
  [`loading-transitions.md`](loading-transitions.md) §1.17. The grid
  starts under the top strip: the pinned strips (Week (H) day strip / hour
  rulers, Month weekday strip, Week (D) day header) dock under the name strip
  (`chromeOffset` = measured `topChromeHeight`), and the viewport-bounded
   grids (Week (Grid), skeletons) run flush to the bottom nav — the floating
    rows overlay the bottom edge. The document-scrolling page pads
    (`.fab-page-pad`, `.dual-page-pad`) add the inline
    `--c2-bottom-chrome-height` var (measured pill + FAB row, net of the FAB
    diameter the formula already adds — the docked draft chip rides inside the FAB
    row, so it needs no extra clearance) so the last row
    clears the whole stack.

  The **prev/next chevrons** in the step pill call the same view-aware
  `navigatePeriod(±1)` dispatch and read their accessible name from
  `periodStepLabel` as the `lg` nav row (`DashboardView.tsx`). The floating
  zoom/pan clusters clamp their visible slice to the FAB row's top edge
  (`bottomBarrierRef` on `GridNavControls`); the floating `FullscreenToggle`
  anchors below the top strip **at `lg`+ only** (`visibleFrom="lg"`) — below `lg`
   the control pill's inline `FullscreenButton` is the fullscreen path. At `lg`+
   everything is unchanged: one chrome box pinned top
   (tab strip + nav row incl. chevrons, New event and Quick links), FABs and
   pill hidden.
- **Floating chrome auto-hide (below `lg`).** While the user is **touching the
  page's content pane** (even without any scrolling) or **scrolling it** in
   either direction (document scroll, the dashboard's month/week/day horizontal
   pan, Week (Grid) hour rows, Month & Agenda panes), the floating rows — the
   dashboard's control pill + FAB row (a docked minimized-draft chip rides its
   FAB row), the Contacts control pill, the Parade
   State control pill + attendance mode bar — fade out and sink away so the
   content owns the whole viewport. They
   slide back **only once the interaction has fully stopped**: the last
   finger/pointer has lifted **AND** the scrolling has settled — so the chrome
   stays hidden through the scroll, the momentum, and any hold-still, and does
   **not** reappear merely because scrolling stopped while a finger is still
   down. Settling is a `scrollend` on the scroller — caught on the pane for the
   internal ScrollArea viewports (it bubbles) and on the `document` capture
   phase for document scrolling — with a 150 ms debounce after the last
   `scroll` event as the fallback where `scrollend` doesn't exist.
    The visibility transition is the pure, unit-tested `advanceChromeHide` state
    machine in `src/lib/ui/chromeHide.ts`; `useChromeHide` only
    wires the DOM events into it: a `touchstart` + `pointerdown` capture on the
    pane (the triggers), the touch/pointer **contact** listeners on `document`,
    `scroll` capture on the pane + `window`, and the two `scrollend` sites; a
     context switch (the dashboard's `shownTabId` tab switch or a wizard
     minimize/restore — its `resetKey` is `${shownTabId}:${formMinimized}`, so
     minimizing always puts the chrome and the docked draft chip back; Parade
     State's attendance mode) forces the chrome back via a `reset` event.
   ```mermaid
   stateDiagram-v2
     [*] --> Visible
     Visible --> Hidden : touch/press in the pane / any scroll
     Hidden --> Hidden : a finger or pointer still down / scroll unsettled
      Hidden --> Visible : last finger/pointer lifted AND scroll settled
      Hidden --> Visible : context switch (reset)
   ```
    "**The pane**" is the page's content element: the dashboard's `weekBoxRef`
    content box (every grid + the pinned day/hour strips), the Contacts page
    column, the Parade State content wrapper. The floating rows are
    `Affix`-portaled to `<body>` and the pan/zoom + fullscreen clusters are
    **siblings** of the box, so the pane-scoped **trigger** can never
    self-fire: tapping a pill button (or the zoom cluster) keeps the chrome up.
    **Contact tracking, by contrast,
   is screen-wide** (on `document`): once hidden, the chrome stays hidden while
   *any* finger/pointer is down, even if it slides off the pane onto the bottom
   nav. Contact is tracked per input type because the two event systems disagree
   about when a touch gesture ends: **touch** uses `TouchEvent.touches.length`
   (authoritative finger count, updated on `touchstart`/`touchend`) — the
   pointer-events `pointercancel` fires when the browser takes over a touch to
   drive a native scroll *while the finger is still down* (and no `pointerup`
   follows), so it must **not** read as a release, and `touchcancel` likewise
   leaves the count unchanged; only `touchend` (dropping the count to 0)
   reveals. **Mouse/pen** use the `pointerdown`/`pointerup` pair (a non-touch
   `pointercancel` is a genuine release). The counts are clamped at zero so a
   stray release and a multi-touch gesture both settle correctly. *Known
   limitation:* this relies on `touchend` firing on finger-lift (true on modern
   Chrome/Android + iOS 16.4+); a browser that fires `touchcancel` and
   suppresses `touchend` would leave the chrome hidden until the next
   touch-lift or a tab switch. Motion: `--c2-dur-quick` / `--c2-ease-out`
   opacity + a `--c2-dist-sm` sink (`.c2-chrome-hide-able` / `.c2-chrome-hidden`
   in `globals.css`, the "target state carries the transition" recipe),
   instant under `prefers-reduced-motion`. The hidden state drops
   `pointer-events` on the row **and** its buttons (overriding the pill's
   tap-through rule) so a hidden pill never catches stray taps. The rows are
   `Affix`-fixed, so hiding causes **no reflow** (the measured
   `--c2-bottom-chrome-height` pads are unchanged). Desktop (`lg`+) is
   untouched; the behavior is always on (no feature flag).
- **Bottom control pill reuse (Parade State / Contacts).** Below `lg` both
  pages shed their sticky top chrome and ride the same `.c2-control-pill`
  Affix recipe (inset 16, zIndex 100; 50px on Parade, 58px on Contacts):
  **Parade** puts the day label + `<`/`>` step + filter + date-picker +
  attendance-toggle circles in one pill (the attendance **mode bar** floats
  above it while in attendance mode and fades/slides in and out —
  `c2-attendance-bar` / `c2-attendance-bar-closing`, the pill's toggle icon
  swaps with a scale-in via `c2-icon-swap`; the top chrome is `lg`-only); **Contacts** puts a
  **rounded search field** (pill-radius `TextInput` at the default `sm`
  size — the themed ~43px input height, same as the lg+ search bar, with a
  matching 44px filter circle; sizing/padding props must go on the input
  via `size`, since `h`/`pl`/`pr` land on the label wrapper and desync the
  field from the pill's padding) + filter circle + a brand-blue **download
  circle** (the export FAB's action moved into the pill, `c2-glass-btn
   c2-glass-fab--brand`) in it, with a **keyboard lift** (`.c2-pill-lift`, a
   `bottom` transition on the Affix root): while the OS keyboard is up the pill
   floats to its **measured** top edge + a 16px gap (`useKeyboardInset`,
   `src/lib/ui/keyboardInset.ts` — a settled `visualViewport` measurement, so it
   lands just above the keys whatever the keyboard height is, instead of a
   guessed `vh` fraction that overshoots), and drops back the moment the
   keyboard closes — even when the field keeps focus (swipe-down dismiss never
   fires `blur`). Parade sets
  `--c2-bottom-chrome-height` (pill + gap) under `fab-page-pad`; the class's
  hardcoded 65px FAB reserve now clears the floating attendance mode bar above
  the pill. Contacts has no floating bar above its pill, so its var subtracts
   the class's hardcoded 65px FAB diameter and carries just pill + gap; at `lg`+
   their top chrome rows are unchanged. Both pages also ride the floating-chrome
   auto-hide above (the shared `useChromeHide` on their content pane): the
   Contacts pill, and on Parade State the pill **plus** the attendance mode bar,
   hide while the user touches/scrolls the roster and return on settle; Parade
   State passes its attendance mode as the `resetKey`, so the bar never mounts
   in a hidden state.
- **App-wide frosted glass (`translucencyLevel`).** Beyond the mobile cluster,
  the surfaces that overlap page content are translucent: the
  bottom nav, the settings tab strip, the desktop sidebar,   the dashboard sticky
  chrome (view tabs + date nav + the mobile view-indicator line) and its inline
  buttons, the pinned horizontal
  grid headers (Week (H) day strip / hour ruler, Month weekday strip, Week (D)
  day header, Week (Grid) day header + all-day row, Month & Agenda pane header),
  and the floating zoom/pan cluster and fullscreen toggle. The app **header** and
  overlays (modals, menus, popovers, tooltips, toasts) stay **opaque** — only
  page-level surfaces are translucent. The **sticky-left label columns** (resource/hour labels and
  the Week (Grid) day-header corner) also stay opaque so event chips scrolling
  beside them stay legible. Low-end devices (`c2-low-end`) fall back to tint only. The
  standalone round FABs (`c2-glass-fab--accent` / `--brand` / `--teal` without
  `c2-glass-btn` — the Contacts download, the
  settings-table FABs) are solid/opaque; the dashboard's tinted glass buttons
  (and the Parade attendance toggle, now a `c2-glass-btn` circle in the control
  pill) keep the frosted tint.
- **Period preservation on switch** (`switchTab` in `DashboardView.tsx`): a
  tab switch is a _filter/context_ change, so switching between two tabs of the
  same kind (or any two day-anchored kinds) keeps the current date; leaving
  Month for an anchored kind starts on today; leaving an anchored kind for
  Month keeps the anchor's month. The last-active tab is **not** remembered —
  the tap only updates `?view=`.
- **The active tab resolves** (`buildDashboardData`, `src/lib/dashboard/data.ts`)
  as URL `?view=` → the first tab in strip order. Title-template assignments (§ of
  [`event-lifecycle.md`](event-lifecycle.md)) stay keyed by **kind**, so all
  tabs of a kind share that kind's display template.

`/?view=` is now an id, the last-active tab is not remembered (a bare load
defaults to the first tab), and the device cookie no longer carries a view, so
**route/cold-start loading cannot shape its skeleton to the arriving kind**:
`loading.tsx` and the PWA launch shell (`public/loading.html`) show one plain
full-page loading box with the centered brand overlay (app icon breathing over
"Waking from Deep Sleep…"); the in-page transition skeletons inside `DashboardView`
still shape to the active tab's kind. The break-glass admin session
(`id="admin"`, no `users` row) renders a static single Month tab with view
management hidden.

## 1.2 Filters

Filtering has **one primary affordance**: a dedicated filter button (funnel icon

- active-group-count badge, `FilterButton`) beside the ⋮ menu in the nav row
  opens `FilterModal` (`src/components/FilterModal.tsx`). The ⋮ menu keeps
  **Today / Select date / Enter fullscreen** only (Force refresh
  is a header button; view management lives on the strip's right settings
  button). Dashboards'
  "Myself" quick action lives inside the filter modal
  beside the Users group; "Reset" clears (role defaults).

The modal promotes the filters most people reach — **Calendars** (chip grid) and
**Users** (badge-dialog picker, `variant: "search"`) — and tucks **Event Types**
behind a "Show"/"Hide" disclosure (`collapsedGroupLabels`; audit-log/user-table
callers keep all groups expanded). A footer scope hint notes _"These filters
apply to {view name} only."_ — filter scoping is **per tab**: each tab stores
its own Calendars/Users/Event Types selection, and clearing one tab's filters
never touches the others.

Filter storage & resolution:

- On the dashboard an active **Users** filter also narrows the rows of
  Day/Week (H)/Week (D) — `buildScheduleResources` takes a `userFilter`
  (`src/lib/events/schedule.ts`) and the Week (D) matrix reuses the same rows.
  An event matches a selected user when it is tagged on them **or** on a
  department they are an active member of (`eventMatchesUserFilter`, with the
  dept→active-member map from the roster), mirroring the clash occupancy model.
- A tab's filter state lives **on the tab row** (`user_dashboard_views.cal_filter`
  / `users_filter` / `types_filter`), each JSON array or SQL `NULL`. `NULL`
  means **role default** (admin: all calendars; non-admin: their own department;
  Users/Event Types: none) and is re-resolved on every render — a department
  added later shows up without touching the tab. An **explicit array** (including
  `[]` = a genuine "cleared" selection) is stored verbatim.
- **Applying or clearing is a server action**, not a URL navigation: the client
  calls `saveDashboardViewFilters` (empty/role-default selections are stored as
  `NULL`), then re-renders from the server so the events refetch under the new
  filter set. Filters never travel in `cal/users/types` URL params. The modal's
  **Clear** button (then Apply) restores the role defaults (`NULL`); a per-group
  **Deselect All** stores the explicit empty array (an empty grid), which is the
  only path that resolves to "no events". Applying is covered end-to-end: the
  dialog's **Apply** button spins through the server write, then the active tab's
  loading bar sweeps through the follow-up read
  ([`loading-transitions.md`](loading-transitions.md) §1.13.2).
- Stored ids/names are re-validated against live calendars/users/types on every
  dashboard read (stale entries drop out; an all-stale list degrades to the role
  default), exactly like the URL params they replaced.
- **Access is unrelated to filters.** A user's department membership — or any
  extra department calendars granted to them — has nothing to do with which
  departments they can filter: every user can always select _every_ department
  in the Calendars filter (the reads are not access-gated). Cross-department
  grants affect only Google Calendar sharing/roles
  ([`roster-sharing.md`](roster-sharing.md) §1.5), and a non-admin's **role
  default** stays their own department — extra grants never expand it.
- The Parade State page mirrors the same split: its filters live on the
  `user_preferences.parade_cal` / `parade_users` row (empty = all), applied via
  `saveParadeFilters` ([`ui-state.md`](ui-state.md)).

```mermaid
flowchart LR
 FB["FilterButton (nav row)<br/>icon + active-group badge"] --> FM["FilterModal"]
 FM --> CAL["Calendars<br/>(chip grid)"]
 FM --> US["Users<br/>(badge picker + Myself)"]
 FM --> ET["Event Types<br/>(behind Show/Hide)"]
 FM --> HINT["Scope hint<br/>(these filters apply to {tab} only)"]
 HINT --> APPLY["saveDashboardViewFilters<br/>(server action)"]
 APPLY --> ROW["active tab row<br/>(cal/users/types, NULL = role default)"]
 ROW --> RESOLVE["buildDashboardData (data.ts)<br/>validates ids vs live data"]
 RESOLVE --> DEF["role default"]
```

## 1.3 Week (D): the custom week matrix

A tab whose kind is `weekv2` renders a custom week matrix — **7 day-columns × the same resource
rows as Day/Week (H)** — in `WeekMatrixView.tsx`
(`src/app/(protected)/dashboard/WeekMatrixView.tsx`). No Mantine Schedule component
fits this shape, so the view is hand-built.

Cell binning is pure and unit-tested in `src/lib/events/weekMatrix.ts`:

- **`coveredDays(event, week)`** — the week days an event's naive start/end
  range occupies; all-day events carry an _exclusive_ end date, so the final covered
  day is the end date minus one.
- **`buildWeekLanes(events, week, memberships)`** — one `WeekSpan` per event per row,
  merged into non-overlapping lanes by greedy interval partitioning (sorted by
  startDay → start time → title). Lane `n` renders on grid row `n + 1` of the
  resource row's nested grid. Row semantics (`rowsForEvent`, `departmentRowId`)
  match the schedule views exactly: events with no row still appear when they are
  **external** (pinned to their calendar's department row); unlinked non-external
  events are dropped. A multi-day event is a single span across its covered columns.
  A `memberships` map (department id → active member user ids) expands each tagged
  department to its active members' rows, so a department-level event shows in
  every member's cell, not just the department row — matching the clash occupancy
  model ([`event-clashes.md`](event-clashes.md) §1.2).

## 1.4 Data flow shared by all views

All views read through the same range/month helpers — never `integration.listEvents`
directly ([`events-cache.md`](events-cache.md)):

- Week (H) and Week (D) both use the same `fetchRangeEvents` 2-month read, so the
  cache, the dashboard filters and the force-refresh nonce are inherited unchanged
  by Week (D).
- The Month view range-reads the months its natural (4–6) week grid displays
  (`monthGridMonths()`, `src/lib/events/datetime.ts`).
- Every tab is **preloaded for instant switches**: after the active context is
  fresh, `DashboardScreen` calls `preloadDashboardTabs` once per anchor, which
  reads the union of every tab's calendars/months in one pass and projects each
  tab's delta (see [`pwa-offline.md`](pwa-offline.md) §1.18). Switching tabs then
  paints from the device cache with no server round-trip.
- **Tab switches are optimistic, decoupled from the router.** A tap sets a
  `previewView` in `DashboardDataContext`; `DashboardScreen` resolves the
  displayed context from `previewView ?? searchParams.view`, so a warm tab paints
  immediately instead of waiting for the RSC round-trip that updates
  `useSearchParams` (a warm tab's data is already local — the route payload was
  the only lag). The `router.push` still runs for persistence/back-forward; the
  preview is transition-aware: it stays while `DashboardView` reports a pending
  router transition, clears once `?view=` catches up, and reverts immediately if
  the transition ends without the URL matching. A long `PREVIEW_STALL_MS` is only
  a safety net for a transition that never resolves. `DashboardView` also
  `router.prefetch`es each tab's clean target URL so the URL catches up promptly.
  (`docs/loading-transitions.md` §1.10/§1.13.2.)
- Wide grids (Day/Week (H)/Week (D), plus Month once its fit-width zoom makes it
  overflow) pan horizontally through `useGridPan` + `GridPanControls`
  ([`grid-pan.md`](grid-pan.md)); the dashboard chrome can go fullscreen
  through immersive mode ([`immersive-mode.md`](immersive-mode.md)).
- **Mobile-band chip padding.** On the mobile band (`max-width: 39.99em`,
  below the app's `lg` breakpoint) the `ScheduleEvent` inner box is tightened
  from the library's `3px 4px` (`4px 6px` at `size="md"`) to `1px 2px`, so more
  of a small grid chip's width is text. It is also switched to column-flex
  centering (`display: flex; flex-direction: column; justify-content: center`)
  so a single-line title no longer hugs the top of the fixed-height chip — the
  library defaults to `display: block; line-height: 1`, which pools all the
  leftover height below the text. Column direction keeps the title a full-width
  block item, preserving the `nowrap` chips' `text-overflow: ellipsis` (the
  same maneuver the library uses at `max-height: 18px`). App-owned classes
  (`c2-schedule-event` / `c2-event-inner`) are attached to the library part
  through the theme's `ScheduleEvent` `classNames` (`src/lib/theme.ts`, matched
  by the component's `__staticSelector` string — no `@mantine/schedule`
  import), then overridden behind the media query in `globals.css` with a
  two-class selector that beats the library's `.m_*` rule. All grid chips
  (Month / Day / Week (H) / Week (Grid) / per-department Resources) render
  through `ScheduleEvent`, so one rule covers them. Desktop keeps the library's
  default top-aligned title.

## 1.5 My-entry highlight

The logged-in user's entries are visually distinguished in every view, so a
roster member can spot their own rows/chips without reaching for the Users
filter. "Mine" means the event was **tagged on the current user or on a
department the current user is an active member of** — exactly the Myself
quick-filter's semantics (`eventMatchesUserFilter`,
`src/lib/events/userFilter.ts`; the organizer counts only when self-invited, and
a tagged department matches every active member, matching the schedule rows and
the clash occupancy model). The highlight is
unconditional (it stays on when the Myself filter is already active) and only
exists for roster members: an admin without a roster row gets the event-level
highlights but no row tint (the same boundary as `onlyMeAvailable`).

Per-view mechanics (all client-side — no cache or server impact):

- **Week (H) / Day / Week (D) — whole-row tint.** `renderResourceLabel`
  (DashboardView) renders the current user's label as a `data-c2-my-row`
  marker span (amber dot + semibold shortname). Structural CSS `:has()` rules
  in `globals.css` — the label cell is the only element containing the marker
  directly, and the row the only element containing it through a direct child
 — tint exactly those two elements (label cell: accent-1 + inset accent-6
  bar; row: accent-0). Mantine rows/slots are transparent by default, so the
  row background shows through and events sit above it. The Week (D) matrix
  additionally tints its day cells uniformly (the row tint wins over the
  today tint there).
- **Month — top rows + chip ring.** `MonthView` assigns each day's rows
  greedily in input order, so the events array is pre-sorted with
  `sortMineFirst()` (`src/lib/events/mineFirst.ts`, pure and unit-tested):
  the user's events first, each block time-sorted — they claim the top rows
  of every day (the topmost _non-conflicting_ row: an earlier-placed multi-day
  event can still hold row 1). With `maxEventsPerDay` this pushes more of
  _other_ events behind "+N more" on dense days — the intended trade-off.
  The user's chips (and their copies in the "+N more" popup) get an amber
  ring via the `renderEvent` hook (`c2-my-event`, `globals.css`).
- **Agenda — row highlight, time order kept.** The Agenda tab and the month
  day modal pass a `renderEvent` that adds `c2-my-agenda-event` to the
  user's rows: amber left bar + light tint + semibold title. The
  chronological order is intentionally not changed.
- **Agenda — swipe hint.** Both agenda listings (the tab and the day modal)
  support a horizontal swipe to change day (`useDrag`, `DAY_SWIPE_THRESHOLD`).
  On touch-first devices only (`(pointer: coarse)`,
  `COARSE_POINTER_MEDIA_QUERY` in `src/lib/theme.ts`) a small centered caption
  — "Swipe left or right to change day" — sits beneath the list, styled like
  the wizard's "Tap outside or press Esc to minimize" hint (xs, dimmed, `pointer-events:
  none`). It is shown at most **once per browser session**: a `sessionStorage`
  flag (`cloudy2.agenda-swipe-hint`) is set on the first successful swipe, so
  the caption never returns once the gesture is discovered. A swipe arms a
  one-shot click-suppression flag (`swipedRef`) so the synthesized click a mouse
  drag emits on release can't open the row it ended over; the wrappers clear it
  on every `pointerdown`, so a touch swipe (which emits no trailing click) can
  never swallow the next event tap.

Colors: the brand amber `accent` family (secondary `#FBC02D`) — distinct from
the event-type colors and the blue `brand` accents used for today/primary. The
tint backgrounds switch on color scheme via the `--c2-my-row-tint` /
`--c2-my-label-tint` custom properties (defined in `globals.css`, consumed by
the `:has()`/agenda rules and — inline — by the Week (D) matrix): light mode
uses the near-white accent-0/1 creams; in dark mode those would glow on the
dark body, so both go to the darker olive amber (row `#3d3200`, label
`#4a3c00` — the same `#3d3200` Parade State uses for its dark-mode amber card).
The accent-6 bars, dot and chip ring are unchanged across schemes.

```mermaid
flowchart LR
 U["currentUser<br/>(session)"] --> M["myEventIds<br/>(eventMatchesUserFilter)"]
 M --> SM["sortMineFirst → MonthView events<br/>(top rows per day)"]
 M --> RE["renderMyMonthEvent / renderMyAgendaEvent<br/>(c2-my-event / c2-my-agenda-event)"]
 U --> ML["renderResourceLabel<br/>(data-c2-my-row marker)"]
 ML --> CSS[":has() rules (globals.css)<br/>(row + label cell tint)"]
 U --> WM["myRowId → WeekMatrixView<br/>(uniform day-cell tint)"]
```

## 1.6 External-event highlight

Events created directly in Google Calendar (no `Created in cloudy2` marker and no
notes block — `isExternalEvent`, [`event-lifecycle.md`](event-lifecycle.md)) carry
`payload.external === true` at read time (`mapCalendarItem`,
`src/lib/events/queries.ts`). Every dashboard view marks them with a **purple**
treatment, in parallel with the amber "mine" language above: amber says "yours",
purple says "created outside the app". An external event can never be _mine_
(it has no recorded creator), so the two highlight classes never collide on one
event.

Per-view mechanics (all client-side over the same `renderEvent` / render-hook
pattern as §1.5 — no cache or server impact):

- **Month — purple chip ring.** `renderMyMonthEvent` (DashboardView) also adds
  `c2-ext-event` to external events; `globals.css` outlines the inner chip
  element (the child carrying the rounded background, exactly like the amber
  `c2-my-event` ring) — including the copies in the "+N more" popup, which
  share the `renderEvent` path.
- **Agenda — purple row bar.** The Agenda tab and the month day modal both pass
  `renderMyAgendaEvent`, which adds `c2-ext-agenda-event` to external rows:
  purple left bar + tint + semibold title. Chronological order is kept, as with
  §1.5.
- **Day / Week (H) — purple block ring.** A shared `renderScheduleEvent` hook
  (new on Week (H); Day folds it into its existing all-day sticky-title hook)
  appends `c2-ext-slot-event` to the event root for external events. The root's
  single child is the chip in every shape — the ScheduleEvent inner box for
  timed events and Week (H) all-day bars, and Day's custom all-day Box — so one
  `> *` outline rule covers all of them.
- **Week (D) — purple banner ring.** The matrix banner's inner Box carries the
  rounded background (and the event's 1px border) itself, so it gets the
  self-ring class `c2-ext-ring` instead of the `> *` variant.

Colors: Mantine's built-in `purple` family — deliberately distinct from the
brand amber (`accent`, mine), the brand blue (`brand`, today/primary) and red
(errors / KAH warnings), so the highlight can't be misread as any of those.
`purple-6` holds on both light and dark bodies for the ring and bar; the agenda
tint switches on color scheme via `--c2-ext-row-tint` (light: near-white
`purple-0`; dark: deep purple `#241a45`, mirroring the mine row's olive-dark
pattern) next to the `--c2-my-*` properties in `globals.css`. Event body colors
are untouched — the highlight is purely additive (ring / bar / tint), so the
department-calendar colors of untyped events keep their meaning.

```mermaid
flowchart LR
 E["payload.external<br/>(isExternalEvent, read time)"] --> M["renderMyMonthEvent<br/>(+ c2-ext-event chip ring)"]
 E --> A["renderMyAgendaEvent<br/>(+ c2-ext-agenda-event bar)"]
 E --> S["renderScheduleEvent / Day all-day hook<br/>(+ c2-ext-slot-event block ring)"]
 E --> W["WeekMatrixView banner<br/>(+ c2-ext-ring)"]
 M --> C["globals.css<br/>(purple outline / bar / tint)"]
 A --> C
 S --> C
 W --> C
```

## 1.7 Timeline zoom (Day, Week (H) and Week (Grid))

The Day and Week (H) schedule views can zoom their hour columns in and out, so the
user can fit more of the day/week in view (overview) or expand it for detail. One
**shared** zoom level scales the width of every hour slot; it does not change the
slot granularity (still 60-minute columns) or the row height.

**Gutter reclamation (canvas only).** The dashboard's content sits inside the
shell's `md` gutter (16px each side, `--app-shell-padding`). At fit the grids fill
that padded width, but any zoomed-in grid overflows into a horizontal pan — so the
gutters become dead space. Whenever the shown view's horizontal zoom is above its
fit/base level (`reclaimGutter` in DashboardView: Month/Dual `monthZoom > 1`,
Day/Week (H) `zoom > 1`, Week (D) `weekMatrixZoom > 1`, Week (Grid) columns
`gridWeekColZoom > 1`), an **inner canvas wrapper** inside the padded
`weekBoxRef` is flushed to the shell edges (`margin-inline: calc(-1 *
var(--app-shell-padding))`, `overflow: clip`), reclaiming ~16px of visible content
per side. The pinned strips and grid live inside that wrapper and widen together,
so weekday/ruler/column alignment is preserved; the tabs, date-nav and their
buttons (and the floating zoom/pan + fullscreen controls, which anchor to the
padded `weekBoxRef`) never move. Returning to fit restores the gutter. Week
(Grid)'s default 2× column zoom means that tab reclaims immediately unless the
user zooms out; Agenda has no zoom and never reclaims.

**Animated zoom (single JS clock).** The zoom is eased rather than snapped, and
the width/slot and the scroll re-anchor are driven by **one** rAF loop so they
can never diverge. React publishes the active view's zoom multiplier as
`--c2-zoom` on the canvas wrapper (plus `--c2-slot-base` for the schedule slot)
and, separately, the Week (Grid) row multiplier as `--c2-row-zoom`; every zoomed
width/slot derives from `var(--c2-zoom-anim, var(--c2-zoom))` — Month's
`monthViewInner` and the weekday strip (`calc(<zoom> * 100%)`), Week (Grid)'s
inner/header/all-day rows (`calc(max(1, <zoom>) * 100%)`), the schedule slot +
ruler (`calc(var(--c2-slot-base) * <zoom>)`), and the Week (D) matrix's day
template/min-width (`calc(112px * max(1, <zoom>))`) — while the Week (Grid) hour
rows derive from `var(--c2-row-zoom-anim, var(--c2-row-zoom, 1))`: the row zoom
is handed to Mantine's `slotHeight` prop as
`calc(3.5rem * var(--mantine-scale) * <rowZoom>)`, so `--week-view-slot-height`
tracks the wrapper var and the grid animates **without a re-render** (its event
positions are percentage-based and its JS never reads `slotHeight` numerically).
On a zoom change `animateZoom` (`src/lib/ui/zoomAnim.ts`, `MOTION.zoom`, the
house `cubic-bezier(0.22, 1, 0.36, 1)`) writes the axis's override var
(`--c2-zoom-anim` / `--c2-row-zoom-anim`) **and** the anchored scroll from the
same interpolated value each frame, then clears the override; the in-flight
registry is keyed per `(element, var)` so the two axes can animate the same
canvas wrapper concurrently.
The scroll is re-anchored by `scrollAnchorTracker`, which captures the
time-content point under the anchor at the start zoom and re-centres it using the
**measured** current content size (`scrollWidth` / `scrollHeight`) and the
**current** viewport size, clamped to the real max; a `label` subtracts the fixed
leading offset that doesn't scale (the horizontal slot-label column, or the
vertical sticky day-header + all-day row). Measuring (rather than using the zoom
ratio) is what makes the last step — zooming out to 100%, where the canvas gutter
morphs and the wrapper/viewport both resize — land without a jump; a fixed-ratio
re-anchor assumed a constant viewport size and overshot the shrunken `maxScroll`,
so the browser clamped it. The row axis needs the same treatment because the
Week (Grid) `ScrollArea` is `maxHeight`-bounded: at low row zoom its viewport
shrinks with the content, and the sticky header/all-day row above the slots don't
scale. The grid viewports also set `overflow-anchor: none` so the browser's own
scroll anchoring can't fight it. This replaced an earlier CSS-transition +
separate JS tween, which drifted (two clocks → the content slid/recoiled) and
whose registered custom-property transition didn't run in Chrome (the columns
snapped).
Motion collapses (instant) under `prefers-reduced-motion: reduce` or the
`c2-low-end` tier, matching the CSS override; only the canvas gutter
`margin-inline` still animates via CSS (`.c2-gutter-anim`).

Week (Grid) is different: it is a conventional 7-day grid whose right-edge
cluster carries **two independent zoom pairs split around the right pan arrow**
— **columns** above it and **rows** below (each side behind its own divider),
each with its **own** remembered level
(`dashboard.gridWeekColZoom` / `dashboard.gridWeekRowZoom`, so neither affects
the Day / Week (H) column widths):

- **Columns** (`gridWeekColumnWidth`, `width = max(1, zoom) × 100%`): scales the
  day-column width. **Defaults to 2× fit** (`GRID_WEEK_COL_ZOOM_DEFAULT` — a
  fresh device opens the grid zoomed in and panning); floored at the fit level
  (its pair disables zoom-out there), so columns never shrink below the
  viewport width (which would leave empty space beside the grid). The
  day-header, all-day and column rows all take the same multiplier, so they
  stay aligned while the grid overflows; at that point the full pan controls
  (drag + edge arrows, `useGridPan`) appear, exactly like Week (H)/Day. A
  layout effect re-anchors the horizontal scroll (measured, accounting for the
  fixed slot-label column) so the day under the viewport's center stays put.
- **Rows** (`gridWeekSlotHeight`, base 3.5rem/56px): scales the hour-slot height
  across the full `0.25–6` range (default 1) and is **animated** like the
  horizontal zooms (ROW_ZOOM_VAR above); a layout effect re-anchors the vertical
  scroll (measured, minus the sticky header/all-day offset).
- **Internal scroll (pinned header + all-day row + left column).** The grid's
  `ScrollArea` is **viewport-bounded** (`scrollAreaProps.style.maxHeight` — the
  viewport minus the shell offsets and `--c2-weekgrid-bottom-budget`, which is
  **0 at every breakpoint**: the grid runs flush to the bottom nav on mobile
  with the floating FABs allowed to overlay its bottom-right, and flush to the
  viewport bottom at `lg`; the page drops its own bottom padding via
  `.weekgrid-page-pad`, which at `lg` also reclaims Main's bottom padding with a
  negative margin), so it scrolls **internally** rather than growing the page.
  At `lg` the whole grid is additionally **lifted behind the sticky chrome** (a
  negative top margin on the shared `.c2-gutter-anim`) so the hour rows scroll
  under the frosted chrome like every other week view, while the library's day
  header and the app's all-day row are **re-pinned below the chrome**:
  (`weekViewHeader` gains `top: <chromeHeight>`, and `weekViewAllDaySlots` becomes
  `top: calc(<chromeHeight> + var(--week-view-week-day-height) - 1px)`) so they
  stay pinned while the hour rows scroll. Below `lg` the top chrome is just the
  name strip and the grid runs flush to the bottom nav again (the floating
  pill/FAB rows overlay its bottom edge, §1.1). The sticky chrome is stacked above
  both the library's timed-event root (`z-index: 3`) **and** the app's highlight
  classes (`.c2-my-event` / `.c2-ext-event`, `z-index: 4` in globals.css):
  **regular events (3) < highlighted events (4) < hour labels (5) < all-day row
  (6) < day header (7)**. Without that headroom the in-day chips paint over the
  all-day row / pinned column once the grid scrolls. The **left label column**
  (week-number corner, "All day", hour labels) is `position: sticky; left: 0`
  too, so it stays put while the columns pan (they overflow by default at the 2×
  zoom); the hour labels need `weekViewInner { overflow: visible }` to escape the
  library's `overflow: hidden`, which would otherwise trap the sticky in a
  scrollport that never scrolls. Once scrolled (the library sets `data-scrolled`
  on the day header), a globals.css rule
  (`c2-weekgrid-head[data-scrolled] + c2-weekgrid-allday`) puts a 1px bottom line
  + drop shadow under the all-day row so events visibly pass beneath the block.
  That bound is also why `startScrollTime` (open at the current time) and the
  row-zoom re-anchor — both read the viewport's `scrollTop` — work here. Unlike
  Month / Day / Week (H) / Week (D), which page-scroll with pinned strips
  rendered outside their scrollers.
- The cluster anchors to the grid's **visible-slice center** like every other
  view — the right pan arrow slot's center lands on it — with the columns pair
  above and the rows pair below; the arrow slot (and its dividers) is reserved
  even when the grid fits without overflowing, so the pairs never shift while
  panning. (Anchoring to the visible slice, not the raw viewport center, keeps
  the cluster below the sticky chrome; a viewport-centered cluster reached the
  floating fullscreen toggle at the top-right on short viewports. The row zoom
  changes the grid's height, but on a grid taller than the viewport the visible
  slice — and so the anchor — is stable, the same contract as the other views.)
  The row pair is passed as the cluster's `secondaryZoom` group.

The rest of this section describes the shared horizontal mechanism.

- **Levels**: discrete `0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6` (`ZOOM_LEVELS`,
  `src/lib/ui/slotZoom.ts`); `1` is the default (today's fixed widths) for the
  Day / Week (H) timeline zoom and the Week (Grid) rows — the Week (Grid)
  columns default to `2` (2× fit, see above). The buttons
  step one level at a time and clamp at the extremes (disabled there).
- **Controls**: `GridNavControls` (`src/components/GridNavControls.tsx`) — the zoom
  in/out pair lives in the **same right-edge control cluster** as the right pan
  arrow (zoom +/− on top, a divider, then the pan arrow), with the left pan arrow
  edge-anchored on the left; the pair is the familiar map-controls layout and can
  never overlap the pan arrow. The **whole cluster is centered** on the grid's
  visible-slice center (zoom pair above, right pan arrow below); the left pan
  arrow stays edge-anchored at that center, so the right pan arrow now rides
  below it ([`grid-pan.md`](grid-pan.md)).
  Rendered whenever the schedule grid is shown (skeleton/empty excluded) — unlike
  the pan arrows it shows even when the grid fits without overflowing.
- **Pinch-to-zoom (touch).** Every zoom site is also pinchable: a two-finger spread
  drives the **same discrete levels** (the `clampZoom` / `clampGridWeekColZoom` /
  `clampMonthZoom` helpers snap the raw scale, so persistence and the re-anchor
  effects need no special casing). `usePinchZoom` (`src/lib/ui/pinchZoom.ts`)
  attaches **native, non-passive** touch listeners to the ScrollArea viewport
  (React's touch handlers are passive at the root, and `preventDefault` is what
  stops the browser's own page pinch); the grids pass `touch-action: pan-x pan-y`
  through `useGridPan` so native panning keeps working. The Week (Grid)'s initial
  finger spread picks the axis (side by side → columns, stacked → rows) and locks
  it for the gesture; Month / Day / Week (H) have a single axis. The zoom
  re-anchors on the **pinch midpoint** — both re-anchor helpers take an optional
  focal offset (default: the viewport centre, the button contract) — so the
  content stays under the fingers, and the level is announced once on release.
  The Month & Agenda pane wires the same hook to its Month pane.
- **Mechanism**: each view reads its slot width from a CSS variable on the view root
  (`--resources-week-view-slot-width` / `--resources-day-view-slot-width`). Mantine
  sizes the day container from that var and lays every event out as a **percentage**
  of it, so changing the var re-lays out slots _and_ events with no JS geometry work.
  `DashboardView` computes the zoomed width (`weekSlotWidth` / `daySlotWidth`) and
  writes it to the var through the view's `style` prop (the Schedule CSS-var gotcha —
  [`desktop-responsive.md`](desktop-responsive.md)).
- **Rulers follow**: the pinned hour ruler and the Week (H) day-label strip follow the
  slot width through a `useLayoutEffect` that probes the var from the DOM and publishes
  it as `--ruler-slot`. Both are a **viewport-width wrapper**, translated by `-scrollLeft`
  via a direct DOM transform on the scroll frame — no re-renders — with only the cells
  that can intersect the viewport rendered (absolutely positioned at their global day /
  slot offsets). The wrapper itself must NOT clip (`overflow: visible`; the parent box
  clips to the viewport): an `overflow: hidden` on the wrapper would keep every cell
  beyond its own (viewport-width) box out of the layer's paint, so translating it could
  never reveal them. The day
  window follows the leftmost visible day; the ruler window advances in 8-slot batches.
  Rendering just the visible window (instead of a full 168-slot / 7-day track) keeps the
  composited layer small, so the labels track the pan smoothly instead of re-rastering
  tiles on the fly. A window update re-renders only the small strip (each registers a
  one-shot advance callback), never the whole dashboard. `zoom` is in that effect's
  dependency list, so both strips re-measure on every zoom change.
  - **Ruler height is explicit** (`1.15rem`): every ruler cell is absolutely positioned,
 so without a set height the sticky strip would collapse to 0px and hide the hour
 markers.
  - **Day labels are anchored, not column-fixed.** A day column (24 slots) is far wider
 than the viewport, so a label fixed at a column's left edge is only visible near
 that edge and "scrolls away" while panning. Instead each label's `left` is clamped
 against the per-frame `--c2-scroll-x` (published alongside the wrapper transform):
 the leftmost visible day's label stays pinned at the strip's left edge while its
 column pans through the viewport, handing off at the day boundary — so a date label
 is always visible during a horizontal pan, on any viewport width.
- **Persistence**: the level is remembered per device in the `cloudy2.ui` cookie as
  `dashboard.zoom` — not URL-backed (zooming never navigates), so it is read from the
  raw cookie and seeded into the client state before first paint (no width jump on
  relaunch). See [`ui-state.md`](ui-state.md).
- **Scope**: the shared horizontal level covers Day and Week (H). Week (D) — its
  columns are day-granularity, not hour slots — and Month and Agenda are
  unaffected. (Month & Agenda's Month pane uses the separate fit-width zoom of
  §1.8; Week (Grid) uses the vertical variant with its own level, above.)
- **Re-anchoring**: zooming keeps the time that was at the viewport's _center_
  centered — a `useLayoutEffect` (declared before the ruler measurement effect)
  re-anchors `scrollLeft` from the previous/next slot-width ratio via the pure
  `reanchorScrollLeft` helper, subtracting the zoom-invariant label-column width
  before scaling and re-adding it after. See `src/lib/ui/slotZoom.ts`.

```mermaid
flowchart LR
 B["Zoom in / out<br/>(GridNavControls cluster)"] --> S["zoom state<br/>(DashboardView)"]
 S --> W["weekSlotWidth / daySlotWidth<br/>(slotZoom.ts)"]
 W --> V["CSS var --resources-*-view-slot-width<br/>(view root style)"]
 V --> G["Mantine grid re-lays out<br/>slots + events (percentage-based)"]
 V --> M["useLayoutEffect re-measures<br/>(zoom in deps)"]
 M --> R["pinned hour ruler +<br/>Week (H) day-label strip"]
 S --> A["reanchorScrollLeft effect<br/>(re-anchors scrollLeft)"]
 S --> C["dashboard.zoom cookie<br/>(usePersistDashboardNav)"]
```

## 1.7.1 Week (Grid) all-day overflow

Mantine's `WeekView` renders all-day events in a **fixed-height strip** whose
chips are half the strip tall (`top: row * 50%`, `height: 50%` of
`--week-view-all-day-slots-height`, default `3rem`), and clips the events layer
with `overflow: hidden`. Only the **first two lanes** are therefore ever
visible; a third and beyond are clipped and only revealed transiently on
hover/focus-within — never on touch. The app does not fight that layout: the
strip keeps its two lanes, and the events in the hidden lanes are surfaced
behind an **inline `+N more`** trigger that replaces the stock "All day" label
in the strip's sticky-left cell.

- **Pure binning** (`src/lib/events/gridWeek.ts`):
  `gridWeekAllDayLayout(events, days, visibleLanes = 2)` mirrors the library's
  classification (`allDay = isMultiday || isActuallyAllDay` — a multi-day timed
  event shares the strip, a half-day `00:00–12:00` / `12:00–24:00` event stays
  on the timed grid, out-of-week events are dropped) and its `sortEvents` +
  greedy `assignEventRows` lane assignment, returning `{ laneCount, hidden,
  hiddenIds }`. Because the assignment is replicated exactly, `hidden` matches
  precisely what the library clips.
- **Grid suppression** (`renderGridWeekEvent`, the Week (Grid) `renderEvent`):
  the Month renderer's amber/purple highlight classes, plus a `display: none`
  placeholder for every all-day chip whose id is in `hiddenIds` — so the hidden
  lanes no longer bleed out on hover and leave the a11y tree. They stay
  reachable from the popover.
- **`+N more` trigger**: Mantine's own `MoreEvents` component (the same one the
  Month view's built-in overflow uses) overlaid on the strip's sticky-left
  "All day" cell, rendered only while the view is Week (Grid) and
  `hidden.length > 0`. The library owns that cell, so the trigger is an
  absolutely-positioned overlay anchored to `gridSlideRef` (which is
  `position: relative`); its geometry mirrors the library's
  `--week-view-week-day-height` / `--week-view-slots-label-width` /
  `--week-view-all-day-slots-height` defaults because the overlay sits outside
  the `WeekView` subtree and can't inherit those vars. While the trigger shows,
  the stock "All day" text is hidden (`fontSize: 0` on `weekViewAllDaySlotsLabel`)
  so the cell reads as the trigger alone; it fills the cell for a full-cell tap
  target and opens `bottom-start` so its popover drops to the right. The popover
  lists the hidden all-day events (day-prefixed via `renderEventBody`) and opens
  the shared `EventDetail` on tap. One week-level trigger — the strip height,
  chip geometry, sticky behaviour and zoom/pan are untouched.

```mermaid
flowchart LR
 E["viewEvents (all-day + multiday)"] --> L["gridWeekAllDayLayout<br/>(gridWeek.ts)"]
 L --> H["hidden / hiddenIds"]
 H --> S["renderGridWeekEvent<br/>(display:none chips)"]
 H --> P["MoreEvents '+N more'<br/>(absolute overlay over the 'All day' cell)"]
```

## 1.8 Month-grid zoom (fit-to-width)

The Month view can zoom its day columns in and out. The **default (zoom 100%) is
"fit to viewport"**: all seven columns are sized to exactly 1/7 of the grid's
width, so the whole week is visible on any screen with no horizontal scroll.
Zooming in widens every day column from there (columns only — `maxEventsPerDay`,
cell height and the "+N more" day modal are unchanged), overflowing the grid into
the same horizontal pan the other views use. As with the other zooms, a zoomed-in
grid reclaims the shell's side gutters for content (see the gutter-reclamation
note in §1.7).

- **Mechanism**: Mantine's MonthView lays each day column out as a percentage of
  its week row (`flex: 0 0 calc(100% / 7)`), which fills the ScrollArea content
  (`monthViewInner`). `DashboardView` therefore sizes that content by the zoom
  multiplier — `width: ${zoom × 100}%` via the MonthView `styles` API — so every
  column, chip and "+N" popup scales together with no JS geometry. The library's
  84px `--min-day-width` floor is zeroed on the same element (`monthViewInnerStyle`)
  so the fit width can squeeze all seven columns into a phone (~50px each).
- **Levels**: discrete `1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6` (`MONTH_ZOOM_LEVELS`,
  `src/lib/ui/monthZoom.ts`). `1` (fit) is the **floor** — the grid can never be
  narrower than the viewport, so zoom-out is disabled there — and the buttons step
  one level at a time and clamp at the extremes.
- **Controls**: the same right-edge `GridNavControls` cluster as the timeline zoom
  (zoom +/− over the right pan arrow, whole cluster centered on the visible slice;
  the left pan arrow edge-anchored on the left), fed by the Month
  view's own `useGridPan` instance (`monthPan`). The zoom pair always shows; the pan
  arrows and drag-to-pan appear only once a zoom level overflows the viewport.
  `GridNavControls` takes the month's level range via `zoomMin`/`zoomMax` (the
  component's defaults remain the timeline zoom's 0.25–6). **Pinch-to-zoom** drives
  the same level (§1.7).
- **Pinned weekday strip**: the `MonthWeekdayStrip` track is sized to the same
  zoomed content width (`width: ${zoom × 100}%`, cells `flex: 0 0 100%/7` — no
  84px floor), so the initials stay exactly over their day columns at every zoom
  level while the strip translates by `-scrollLeft`.
- **Re-anchoring**: zooming keeps the day at the viewport's _center_ centered. A
  `useLayoutEffect` re-anchors `scrollLeft` from the previous/next zoom ratio via
  the pure `reanchorScrollLeft` helper (no label column — the ratio is just
  oldZoom→newZoom, since per-day width = viewportWidth × zoom / 7).
- **Persistence**: the level is remembered per device in the `cloudy2.ui` cookie as
  `dashboard.monthZoom` — a key separate from the Day/Week (H) `zoom` so each view
  keeps its own level — read from the raw cookie and seeded before first paint.
  See [`ui-state.md`](ui-state.md).

```mermaid
flowchart LR
 B["Zoom in / out<br/>(GridNavControls cluster)"] --> S["monthZoom state<br/>(DashboardView)"]
 S --> I["monthViewInnerStyle<br/>(monthViewInner width %, --min-day-width 0)"]
 I --> G["Mantine grid re-lays out<br/>columns + events (percentage-based)"]
 S --> A["reanchorScrollLeft effect<br/>(re-anchors scrollLeft)"]
 S --> P["monthPan → pan arrows/drag<br/>(only when the grid overflows)"]
 S --> T["MonthWeekdayStrip track<br/>(same zoomed width)"]
 S --> C["dashboard.monthZoom cookie<br/>(usePersistDashboardNav)"]
```

## 1.9 Month & Agenda

A tab whose kind is `dual` renders the Month grid and the Agenda list in one
view — side by side at `lg` and up; below `lg` the Agenda pane is hidden and
the Month pane behaves exactly like the standalone Month view — in
`DualPaneView.tsx` (`src/app/(protected)/dashboard/DualPaneView.tsx`).

**It is a day-anchored kind**, like Day/Week/Agenda: one shared `?date=` anchor
drives both panes. The Month pane shows the anchor day's month and the Agenda
pane shows that day's list, so the two always agree. The nav row's chevrons
move **±1 month** (keeping the day-of-month — dayjs clamps overflow, so Jan 31 →
Feb 28), the Agenda pane's own ‹ › header moves **±1 day** (a step across a
month edge moves the grid too), and the date picker opens in day mode.
At `lg` and up, **tapping a day cell in the grid selects that day in the
Agenda pane** — this view has no day modal there, the pane *is* the day detail
(the chips are pass-through, see the Month-pane bullet). Below `lg` the grid
is the standalone Month view: chips open the event detail and a cell tap opens
the shared agenda day modal. Data needs are therefore
identical to Month's (`requiredMonths` returns `monthGridMonths` for `dual`),
and `planDashboardSwitch` needs no dual-specific rule: the anchored branches already
cover it (Month → Month & Agenda starts today, anchored → Month & Agenda keeps
the anchor day, Month & Agenda → Month keeps the anchor month).

- **Layout & independent scroll.** At `lg` and up the whole view is **bounded to
  the viewport's remaining height** (`--app-shell-vh`/header/footer minus the
  measured chrome and the Stack gap) and each pane is a fixed-header column with
  its **own vertical scroll** (`overflow-y: auto` + `overscroll-behavior: contain`),
  so scrolling one never moves the other. The page's own bottom padding is
  reclaimed (`dual-page-pad`: zero bottom padding + a negative bottom margin that
  cancels `AppShell.Main`'s padding, symmetric with the Stack's negative top
  margin), so the bounded container still totals exactly `100dvh` — no document
  scroll — while the panes run **flush to the viewport bottom** (no blank strip
  under the agenda card or the month grid). **Both panes' content fills that
  bounded height**: the Agenda card stretches to the pane (a long day list
  scrolls inside the card, not the pane) and the Month grid's natural week rows
  grow to fill the pane on a tall viewport. The layout key is
  the `lg` breakpoint, not the device: a large phone (e.g. an unfolded Fold)
  gets the side-by-side bounded layout too. Below `lg` the Agenda pane is hidden
  — the full-width month grid scrolls with the document and the handle is absent.
- **Split & resize.** The Month pane takes the remembered `dualSplit` fraction
  (device-local cookie, [`ui-state.md`](ui-state.md); default 0.6, clamped
  0.25–0.75 by `src/lib/ui/dualSplit.ts`). A drag handle between the panes
  resizes them: a pointer-capture drag writes the live fraction straight to a
  `--c2-dual-split` CSS variable on the container (no React work per frame) and
  commits once on release; the handle is a focusable `separator` whose
  Left/Right arrows step 5% and whose double-click resets to the default.
- **Month pane.** The standalone Month view's grid: the fit-to-width zoom of
  §1.8 including its **pinch-to-zoom** (its own `useGridPan` instance,
  `MonthWeekdayStrip`, and a
  `GridNavControls` cluster portaled to `<body>` so the transient slide
  transform can't jitter the fixed controls), the same `monthEvents` ordering
  and `renderMyMonthEvent` highlights. At `lg` the strip is the pane's fixed
  header (`sticky={false}` — the pane is the scroll container, so a
  chrome-relative `top` would push it down) and is pinned non-shrinkable
  (`flex-shrink: 0`): as a flex item, `overflow: hidden` would otherwise nullify
  its automatic minimum size and let the pane's overflow crush and clip the
  labels. Also at `lg`, the month's natural
  week rows grow to fill the bounded pane: the pane's scroll box is measured and Mantine's
  `--month-view-max-events` gets a fractional override (`52px + N * 24px` per
  row), so the event chips scale with the row while the rendered count stays at
  four; a 4-event floor keeps the natural row height — and the pane's own scroll
  — on shorter viewports. At `lg` and up the event chips
  are deliberately **pass-through** (`c2-inert-event` in `globals.css` disables
  the chip's whole subtree + `tabIndex: -1`, no `onEventClick`): Mantine
  re-enables `pointer-events` on the inner chip, so the root-only override was
  not enough — the class kills the inner chip too, so every tap falls through
  to the day-cell button beneath and chip and empty-cell taps alike select the
  day (day cells keep their roving tabindex for keyboard). Below `lg` (where
  the Agenda pane is hidden) the grid is the standalone Month view's wiring:
  the chips render live and open the event detail, a cell tap opens the shared
  agenda day modal (`onDayOpen` → the same helper the Month view's cell tap
  uses), and the `+N more` popover works too.
- **Agenda pane** (at `lg` and up — not rendered below `lg`). The Agenda tab's
  list under a day header (day label + ‹ › chevrons): `eventsOnDay`,
  `renderMyAgendaEvent`, the directional slide on a day change, and the touch
  swipe-to-change-day gesture with its once-per-session hint. The header is
  the pane's fixed header (bounded layout), and the bordered card fills the pane
  below it — a long day list scrolls inside the card (`agendaViewBody`), so a
  short day never leaves a blank strip under the card. Both the card root and
  that body carry `touch-action: pan-y`: the body is a scroll container nested
  inside the swipe container, and the browser intersects `touch-action` only up
  to the first containing scrolling element, so without it the outer swipe
  container's value is ignored and the browser's `pointercancel` kills the
  swipe. `pan-y` keeps the vertical scroll native while the app owns horizontal.
- **Chrome.** The nav row labels the period with the **month** (the pane header
  carries the day); the screen-reader announcement appends the agenda day so a
  day move is announced too. The agenda header reserves the floating fullscreen
  toggle's box on its right (desktop only — the toggle floats over that corner),
  so the day chevrons stay tappable under it. The loading skeleton is
  `DualPaneSkeleton` — the two view skeletons in the same responsive layout at
  the same split.

```mermaid
flowchart LR
 D["?date= anchor"] --> M["Month pane<br/>monthGridMonths(month)"]
 D --> A["Agenda pane<br/>eventsOnDay(day)<br/>(lg and up only)"]
 D --> R["requiredMonths = monthGridMonths<br/>(same as Month)"]
 H["drag handle / arrow keys"] --> S["dualSplit cookie<br/>(--c2-dual-split CSS var)"]
 S --> M
 N["below lg: month pane = Month view<br/>chip → detail, cell → day modal"] -.-> M
```

## 1.10 File index & related docs

| File | Role |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/dashboardViews/views.ts` | Kind vocabulary + labels, tab DTO, filter-override normalizers, `resolveActiveTab` (pure) |
| `src/lib/dashboard/navigation.ts` | Dashboard navigation decision (URL → displayed tab/period/coverage + fetch classification), incl. the period-follows-kind URL rule (`planDashboardSwitch`) shared by the tab tap and the tab-URL prefetch (pure) |
| `src/lib/dashboardViews/queries.ts` | Tab reads + the mutex-guarded default "Month" seed |
| `src/lib/dashboardViews/actions.ts` | Tab CRUD: `create/rename/delete/reorderDashboardViews`, `saveDashboardViewFilters` |
| `src/lib/userPrefs/queries.ts` + `actions.ts` | `user_preferences` row: parade filters (incl. `saveParadeFilters`) |
| `src/app/(protected)/dashboard/DashboardView.tsx`  | Tab strip (+ trailing Add-view button, right-side Manage-views gear and All-views jump popover), optimistic tab switch + period rules + tab-URL prefetch, filter state, schedule zoom + month zoom state & widths |
| `src/app/(protected)/dashboard/DashboardScreen.tsx` | Snapshot/warm-cache/preload owner; resolves the displayed context from `previewView ?? ?view=` so warm tab switches paint without waiting on the RSC |
| `src/app/(protected)/dashboard/EditViewsModal.tsx` | Manage-views dialog: Add-view button + card manage list (subtle ↑/↓ reorder, per-row Edit dialog for name+type+filters, nested delete confirm) |
| `src/app/(protected)/dashboard/ViewTypePicker.tsx` | Shared seven-kind picker (Month & Agenda/Month/Week (H)/Week (D)/Week (Grid)/Day/Agenda): a **thumbnail grid** in the Add-view dialog and the Edit-view dialog's type chooser, a compact text list for other uses |
| `src/app/(protected)/dashboard/DualPaneView.tsx` | Month & Agenda renderer: resizable Month + Agenda panes (§1.9) |
| `src/app/(protected)/dashboard/MonthWeekdayStrip.tsx` | Pinned weekday-initials strip, shared by the Month view and the Month & Agenda view's Month pane |
| `src/components/AgendaSwipeHint.tsx` | Touch-only agenda swipe caption, shared by the Agenda tab, day modal, Month & Agenda and Parade State |
| `src/lib/ui/dualSplit.ts` | Pure Month & Agenda split levels + clamping (`clampDualSplit`, `stepDualSplit`) |
| `src/app/(protected)/dashboard/viewMeta.tsx` | Kind → icon/label/thumbnail map shared by the strip, the type picker, the Manage-views rows |
| `src/app/(protected)/dashboard/viewThumbnails.tsx` | Hand-drawn SVG wireframe previews (120×80, `currentColor` strokes + amber event chips) for each of the seven kinds |
| `src/components/reorderUpDown.tsx` | Shared touch-friendly manage-row recipe: ~40px ↑/↓ chevron pair (`ReorderUpDown`) + row-action sizes |
| `src/app/(protected)/dashboard/page.tsx` | Resolves tabs + active tab (`?view=` → remembered → first), validates per-tab filters |
| `src/app/(protected)/dashboard/WeekMatrixView.tsx` | Week (D) matrix renderer |
| `src/lib/events/weekMatrix.ts` | Pure Week (D) lane binning (`coveredDays`, `buildWeekLanes`) |
| `src/lib/events/gridWeek.ts` | Pure Week (Grid) all-day lane binning (`gridWeekAllDayLayout`) for the `+N more` overflow (§1.7.1) |
| `src/lib/events/mineFirst.ts` | Pure "mine first" sort for the month view's greedy row assignment |
| `src/lib/events/schedule.ts` | Resource rows (`buildScheduleResources`, `userFilter`) |
| `src/lib/ui/slotZoom.ts` | Pure zoom levels + slot-width math (`clampZoom`, `stepZoom`, `weekSlotWidth`, `daySlotWidth`) |
| `src/lib/ui/monthZoom.ts` | Pure Month fit-width zoom levels + stepping (`clampMonthZoom`, `stepMonthZoom`) |
| `src/components/GridNavControls.tsx` | Day/Week (H) + Month right-edge cluster: zoom +/− + right pan, plus left-edge pan |
| `src/components/FilterButton.tsx` | Dedicated filter button (icon + active-group badge) replacing the kebab's filter menu |
| `src/components/FilterModal.tsx` | Filters dialog (collapsible groups, per-tab scope hint) |

Related docs:

- [`events-cache.md`](events-cache.md) — the read path every view uses.
- [`grid-pan.md`](grid-pan.md) — horizontal pan for the wide grids.
- [`immersive-mode.md`](immersive-mode.md) — fullscreen calendar chrome.
- [`user-picker.md`](user-picker.md) — the Users filter's badge-dialog picker.
- [`desktop-responsive.md`](desktop-responsive.md) — the slot/label width table and the Schedule CSS-var gotcha zoom builds on.
- [`ui-state.md`](ui-state.md) — server-side prefs (tabs + filters) vs the device-local cookie (`zoom`, date/month, sidebar).
