# 1. Desktop responsive layout

Cloudy2 started as a strictly mobile-first app (bottom nav, card lists, floating
modals). It now also presents a purpose-built layout for wide screens: at Mantine's
`lg` breakpoint (**640px = 40em** — the width of an unfolded foldable's inner
screen) and above the shell gains a left sidebar, pages
center in a bounded container, data-dense lists become tables, card lists flow into
multi-column grids, and modals/forms widen. Below `lg` **nothing changes** — the
mobile layout is byte-for-byte the same code path. Between 640 and 799px the
sidebar auto-collapses to the 64px icon rail (see [1.2](#12-app-shell-sidebar--collapsed-bottom-nav)).

On the **other end**, very small form-factor phones (≤ 360px — iPhone SE 1st gen,
Galaxy Fold cover, small Androids) get a **compact tier**: the fixed-width chrome
that overflows at that width (header button row, bottom-nav text labels, `sm`
modals) renders tighter variants. See [1.10 Compact tier](#110-compact-tier).

## Table of contents

- [1.1 Breakpoint & detection](#11-breakpoint--detection)
- [1.2 App shell (sidebar + collapsed bottom nav)](#12-app-shell-sidebar--collapsed-bottom-nav)
- [1.3 Layout scaffolding (globals.css)](#13-layout-scaffolding-globalscss)
- [1.4 Dashboard](#14-dashboard)
- [1.5 Settings](#15-settings)
- [1.6 Parade State & Contacts](#16-parade-state--contacts)
- [1.7 Modal sizes](#17-modal-sizes)
- [1.8 Login & PWA](#18-login--pwa)
- [1.9 File index](#19-file-index)
- [1.10 Compact tier](#110-compact-tier)
- [1.11 Related docs](#111-related-docs)

## 1.1 Breakpoint & detection

One breakpoint governs the **shell**: Mantine `lg`, pinned to **640px** via a
theme override (`src/lib/theme.ts` sets `breakpoints.lg` to `"40em"`, matching
the CSS block). Mantine's default `lg` is 75em (1200px); without the override
the JS `isDesktop` query, the `visibleFrom="lg"` props, and the `40em` CSS
would drift apart. The override makes every `lg:` reference mean 640px.
A second JS-only query, `DESKTOP_WIDE_MEDIA_QUERY` (`(min-width: 50em)`, 800px),
marks the band where the full 240px sidebar replaces the auto-collapsed icon
rail. The card grids (`ContactList`, `ParadeStateView`) keep an **earlier**
`36em` (576px) breakpoint; with the shell now switching at 40em it only covers
the 576–639px mobile band (where two 300px columns don't actually fit yet) and
is kept as harmless insurance for future breakpoint moves.

| Medium | Where | Usage |
| ------ | ----- | ----- |
| CSS | `src/app/globals.css` | `@media (min-width: 36em)` (576px: card-grid ≥300px, vestigial) + `@media (min-width: 40em)` block (40em = 640px at the default 16px root: shell + card-grid ≥320px) |
| Theme | `src/lib/theme.ts` | `breakpoints.lg: "40em"` — aligns Mantine's `lg` with the CSS (`xs` is 36em; note `lg` now sits *below* `sm` = 48em, so prefer `lg:` and don't mix `sm:`/`md:` in one responsive prop). `NARROW_MEDIA_QUERY` (`(max-width: 22.5em)`, 360px) is the compact-tier query — deliberately **not** a Mantine breakpoint, because responsive props like `{ base: … }` use min-width keys and can't express "below X" |
| Client components | `@mantine/hooks` | `const theme = useMantineTheme(); const isDesktop = useMediaQuery(\`(min-width: ${theme.breakpoints.lg})\`)` (do **not** append `px` — `theme.breakpoints.lg` is an em string); `const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY)` for the compact tier; `DESKTOP_WIDE_MEDIA_QUERY` for the ≥ 800px full-sidebar band |
| Mantine props | core | `visibleFrom="lg"` / `hiddenFrom="lg"` (note: v9 has no `hiddenDown`/`visibleDown`), responsive props like `maw={{ base: 380, lg: 440 }}`, `Grid.Col span={{ base: 12, lg: 6 }}` |

Server components do not need the flag: they render both variants and let the
CSS/`visibleFrom`/`hiddenFrom` props decide.

```mermaid
flowchart LR
    A[Viewport width] --> B{≥ 576px?}
    B -- no --> B0{≤ 360px?}
    B0 -- yes --> C0[Compact tier<br/>header/nav/modals tighten]
    B0 -- no --> C[Mobile single-column<br/>bottom nav · card lists · sm modals]
    B -- yes --> B2{≥ 640px?}
    B2 -- no --> C2[Mid-width band<br/>bottom nav · card-grid]
    B2 -- yes --> D[Desktop layout]
    D --> D2{≥ 800px?}
    D2 -- no --> E2[Sidebar auto-collapsed<br/>64px icon rail]
    D2 -- yes --> E[Left sidebar 240px, minimizes to a 64px icon rail<br/>bottom nav collapsed]
    D --> F[PageContainer ≤ 1200px]
    D --> G[Tables / 320px card-grid<br/>md-lg modals · 2-col forms]
```

## 1.2 App shell (sidebar + collapsed bottom nav)

`src/components/AppShellShell.tsx` (client) renders the whole authenticated shell:

- **Navbar** — `AppShell navbar={{ width: collapsed ? 64 : 240, breakpoint: "lg",
  collapsed: { mobile: true } }}`: appears at `lg`
  with the four nav items (Calendar, Parade State, Contacts, Settings for admins) as
  `NavLink`s driven by the same local `items` array (the `NavItem` constants defined in
  the same file) the mobile footer renders. Below `lg` Mantine collapses it
  automatically.
- **Collapsible rail (desktop only)** — a button pinned to the bottom of the navbar
  (`IconLayoutSidebarLeftCollapse`/`IconLayoutSidebarLeftExpand`) minimizes the
  sidebar to a 64px
  **icon-only rail**: the `NavLink`s swap for centered icon buttons (`RailNavButton`,
  label on a right-side `Tooltip`, `aria-label` + `aria-current` kept) and the
  `AppShell` `navbar.width` drops 240 → 64, which Mantine re-emits into the
  `--app-shell-navbar-width`/`-offset` CSS vars every render, so the main area's
  padding follows. The resize animates: the navbar gets an inline
  `transitionProperty: "transform, top, height, width"` (Mantine animates
  transform/top/height by itself; the main area already transitions its padding).
  The state is **remembered per device** in the `cloudy2.ui` cookie as
  `sidebarCollapsed` (see [ui-state.md](ui-state.md)): the (protected) layout
  reads it from the cookie before first paint and passes it to the shell as the
  initial state (the server renders exactly what was remembered — no client
  restore, no flash, no hydration mismatch), and a `useEffect` converges the
  cookie on every toggle. The rail never affects < `lg` (the navbar is hidden
  there by Mantine's `collapsed.mobile`).
  - **Auto-collapse in the foldable band:** entering the 640–799px band
    (`isDesktop && !isDesktopWide`, `DESKTOP_WIDE_MEDIA_QUERY` = 800px)
    one-shot sets `collapsed = true`, since 240px of full sidebar would eat a
    third of a 640px viewport. The effect only fires on *entry* into the band,
    so a manual expand inside it survives until the next entry (resize across
    800px and back, or a fresh load in the band); above 800px the remembered
    cookie state rules untouched.
- **Footer** — `footer={{ height: BOTTOM_NAV_HEIGHT_CSS, collapsed: isDesktop }}`:
  the bottom nav stays for mobile; at `lg` it collapses off-screen and its layout
  offset drops to 0 (Mantine's `collapsed` footer behavior), so the FAB clearance
  below it no longer applies. A collapsed footer is only *translated* off-screen,
  so its measured height is still 56px — the iOS/Android **PWA-standalone
  viewport sync** (`AppShellShell`, `--app-shell-vh` effect) must therefore skip
  writing `--app-shell-footer-offset` when `isDesktop` (an inline custom property
  on the shell root beats Mantine's `:root { …: 0px !important }` for all
  descendants — the old unconditional write left the navbar 56px short of the
  viewport bottom and padded Main's bottom by the same amount on installed
  PWAs at desktop width).
- `isDesktop` comes from `useMediaQuery` (see 1.1); it drives the footer's
  `collapsed` prop and the standalone-sync footer-offset guard — the navbar
  collapse is Mantine's own `breakpoint`.
- **Compact tier (`isNarrow`)** — at ≤ 360px the header gutters tighten and
  the bottom nav drops its per-item text labels to icons only (each button
  keeps `aria-label={item.label}`). The header's pinned-events ticker keeps
  rotating at this width (the logo it replaced is gone, so the pill fits) —
  its max-width caps it in CSS. This is the JS half of the compact tier; the
  `NARROW_MEDIA_QUERY` hook sits next to `isDesktop` in `AppShellShell`.
- The shell root carries `className="app-shell-root"`, the hook for the floating
  offset variable (1.3).

## 1.3 Layout scaffolding (globals.css)

Pure-CSS switches live in `@media (min-width: 36em)` (card-grid early grid)
and `@media (min-width: 40em)` (desktop shell) blocks in
`src/app/globals.css`, plus a few base classes:

| Class / var | Mobile `< 36em` | Mid `36em – 40em` | At `lg` `≥ 40em` | Consumed by |
| ----------- | -------------- | ----------------- | --------------- | ----------- |
| `.app-shell-root` → `--app-floating-bottom-offset` | `calc(56px + env(safe-area-inset-bottom) + 16px)` (clears bottom nav) | same | `16px` | `FloatingToolbar` default `bottomOffset` |
| `.settings-page-pad` → `--settings-fab-bottom` + `padding-bottom` | `calc(108px + env(safe-area-inset-bottom) + 16px)` (clears bottom nav + settings tab bar) | same | `16px` | settings `layout.tsx` wrapper; the four settings FABs pass it to `FloatingToolbar` |
| `.app-shell-root` → `--app-shell-header-offset` | `56px` (declared unconditionally — the AppShell header is fixed at every width; consumers that want desktop-only stickiness gate in JS) | `56px` (same) | `56px` (same) | `SettingsTabs` sticky row (JS-gated to `lg`+); the dashboard's sticky tabs+date-nav chrome block and Week (D) day-header strip (sticky at all widths); the Week (H) view's day-label strip |
| `.page-container` | full width | full width | `max-width: 1200px; margin-inline: auto` | `PageContainer` component |
| `.card-grid` | `1fr` single column | `repeat(auto-fill, minmax(300px, 1fr))` — still bottom-nav, 2 columns only from ~644px (in practice the band is too narrow, so it renders 1 column) | `repeat(auto-fill, minmax(320px, 1fr))` | `ContactList`, `ParadeStateView` |

`PageContainer` (`src/components/PageContainer.tsx`) is the thin wrapper
(`<Box className="page-container">`) that data pages apply to their root so
content centers without touching each page's internals.

The old fixed pixel offsets (`BOTTOM_NAV_FLOATING_OFFSET`,
`SETTINGS_TAB_BAR_OFFSET` / `settingsTabBar.ts`) were deleted — the CSS variables
above replace them, so a FAB's clearance now re-resolves automatically at the
breakpoint.

## 1.4 Dashboard

`DashboardView.tsx` owns the desktop differences for the calendar tabs (all
gated on `isDesktop`):

| Element | Mobile | At `lg` |
| ------- | ------ | ------- |
| Schedule views' resource/group label widths (`--resources-day-view-*` / `--resources-week-view-*` vars) | `3rem` / `1.5rem` | `6rem` / `3.5rem` — shortnames get room to stop ellipsizing |
| Week (H) timeline slot width (`--resources-week-view-slot-width`) | Mantine default (`calc(3.75rem * var(--mantine-scale))`, 60px/hour) | `calc(4.5rem * var(--mantine-scale))` (72px/hour) |
| Day timeline slot width (`--resources-day-view-slot-width`) | Mantine default (`calc(5rem * var(--mantine-scale))`, 80px/hour) | same — both slot widths are then multiplied by the shared **timeline zoom** level (0.5–2, default 1; see [`dashboard-views.md`](dashboard-views.md#17-timeline-zoom-day-and-week-h)) |
| Week (D) matrix label columns | `MOBILE_LABEL_WIDTH` 3rem / group 1.5rem | `DESKTOP_LABEL_WIDTH` 5rem / group 2.5rem (header spacers, sticky row labels, `contentMinWidth`, `labelLeft`) |
| Month view `maxEventsPerDay` | 3 | 4 |
| "New event" | FAB only | FAB **hidden** (`hiddenFrom="lg"`) — replaced by a `Button visibleFrom="lg"` in the header row beside the ⋮ menu |
| Agenda day / event form / detail / filter / date-picker modals | `sm` | `md` (see 1.7) |

**Month view shows adjacent-month days with their events (every width):**
`MonthView` keeps its Mantine defaults (dimmed outside days + the fixed
6-week grid), and the page range-reads the months the grid actually displays
— `monthGridMonths()` (`src/lib/events/datetime.ts`), the Monday on/before the
1st through six full weeks (2-3 months, via `fetchRangeEvents`) — so the
dimmed cells carry their events and multi-day events spanning a month
boundary render as one bar across them. The loading skeleton matches the
fixed 6-row shape via `monthGridRows()`.

**Sticky chrome & pinned view headers (every width):** the dashboard pins its
view tabs + date-nav row as **one sticky unit** (`top:
var(--app-shell-header-offset)`, opaque background, bottom divider,
compact 36px controls) so the period label, prev/next chevrons and ⋮ menu stay
reachable while any view's grid scrolls — on phones too, where losing them
mid-scroll was the old default. The unit renders at `zIndex: 50`, above every
layer `@mantine/schedule` stacks internally (sticky-left columns reach
z-index 12-13, scrollbars 20), so grid content sliding beneath never paints
over it. The unit's height is measured with a `ResizeObserver`
(pre-first-paint + on resize) and feeds every view header that docks beneath
it via `top: calc(var(--app-shell-header-offset) + <chromeHeight>px)`:

- **Week (D)** day header (`WeekMatrixView`, prop `chromeOffset`) — already
  sticky, now correctly docked below both chrome rows.
- **Week (H)** day-label strip (`WeekDayLabelStrip`, zIndex 45) — sticky with the
  same docking formula; its horizontal pan tracking (`weekDayIndex`) is
  unchanged.
- **Day/Week (H) hour rulers** (`TimeRulerStrip`, zIndex 45) — the library's own
  time-labels rows are hidden and replaced by a pinned strip of compact hourly
  labels whose inner track translates by `-scrollLeft` via direct DOM
  transforms (same mechanics as Week (D)'s header). The measured slot width
  comes from probing each view's `--resources-*-view-slot-width` CSS var; both
  views' `scrollAreaProps.viewportRef` lets a layout effect re-sync the track
  after mounts/loads, since the libraries' `startScrollTime` /
  `startScrollDateTime` effects reposition the grid without a scroll event.
   (Side fix: Week (H) now passes the supported `startScrollDateTime` instead of a
   bogus `startScrollPosition: {y}` prop that was silently ignored.) The anchor
   is dynamic: the Day view uses the current time when its date is today, the
   Week (H) view uses `{today} {now}` when the shown week contains today — both fall
   back to 07:00 / Monday 07:00 otherwise (`DashboardView`:
   `currentScrollTime`).

The **Month weekday-initials row** is replaced by a pinned `MonthWeekdayStrip`
(like the Week (H) day-label strip): Mantine's own row lives inside `MonthView`'s
content-height `ScrollArea` and scrolls away with the page, so the view passes
`withWeekDays={false}` and a custom strip pins beneath the chrome. The Month grid
enforces a 5.25rem (84px) minimum column width, so on narrow screens the 7-column
grid (≥588px) scrolls horizontally — the strip's inner track mirrors that width
and translates by `-scrollLeft` via `monthScrollAreaProps`, keeping the initials
over their columns. Agenda is intentionally header-less (the nav row shows the
day).

**Schedule CSS-var gotcha:** `@mantine/schedule` declares its label/slot width
variables on the **view root element** (hashed class), so a parent class cannot
shadow them. `DashboardView` therefore passes the widths through each view's own
`style`/`vars` props, and `WeekMatrixView` (a fully custom component) computes the
widths in JS and inlines them. The timeline zoom's slot width rides the same
mechanism — the zoomed value is written to `--resources-*-view-slot-width` through
each view's `style` prop ([`dashboard-views.md`](dashboard-views.md#17-timeline-zoom-day-and-week-h)).
The pinned Week (H)-day header strip takes the same
widths as props (`resourceLabelWidth`/`groupLabelWidth`) so its corner spacers
track the label columns at both breakpoints.

**FAB-hiding gotcha:** `FloatingToolbar`'s `Affix` portals its content to
`<body>` (`withinPortal` default), so a `hiddenFrom` wrapper *around* the
toolbar hides only an empty div while the portaled FABs stay visible at every
width. Responsive visibility must be passed as `hiddenFrom` **on
`FloatingToolbar` itself** — it forwards to the portaled Affix root, where the
CSS actually applies. This is how every mobile-only FAB hides at `lg`
(Dashboard "New event", Users/Departments/Event types/Webhooks "Add …",
Contacts/Audit-log "Export", Parade-state attendance).

## 1.5 Settings

- **`SettingsTabs`** — below `lg` it stays a fixed strip above the bottom nav; at
  `lg` it becomes a **sticky top row** so the tab bar stays visible while a long
  table scrolls. The sticky element is a `Box` wrapping `<Tabs>` — it must be a
  direct child of the settings layout root (a full-height column), because a sticky
  element pinned to the `Tabs` root alone can't stick: that root is only as tall as
  the tab bar and scrolls away with the page (same pattern as the dashboard's
  sticky chrome block). Unlike the dashboard, this one is deliberately **JS-gated
  to `lg`+** (the component returns a non-sticky version below `lg`) — the CSS var
  it consumes is defined at every width.
- **Data-dense lists use Mantine `Table` at `lg` only** (the scoped exception to
  the mobile card-list rule — cards stay below `lg` via `hiddenFrom="lg"`, the
  table wrapper uses `visibleFrom="lg"`):

  | Page | Desktop columns |
  | ---- | --------------- |
  | Users (`UserTable`) | Name · Phone · Role · Department · Status · Edit (row click = edit) |
  | Departments (`DepartmentTable`) | Name · Calendar ID · Share · Rename · Delete |
  | Event Types (`EventTypeTable`) | Name · Group · Acronym · Color · Time options · Allowed locations (row click = edit) |
  | Audit Log (`AuditLogView`) | Time · Actor · Action · Entity · Route · Details (row click = detail modal) |

- **Audit Log filters** — mobile keeps them in the ⋮ menu; at `lg` they render as
  an inline bar (search field + Actor/Action/Entity selects + from/to date inputs +
  Reset + Export) above the table.
- **Forms go 2-column** at `lg` via `Grid gap="md"` with
  `Grid.Col span={{ base: 12, lg: 6 }}` pairs: `UserForm` (Name/Shortname,
  Phone/Email, Birthday half-width) and `TemplatesForm` (the General tab's
  `SettingsForm` and the Security tab's `SecurityForm` each render a single
  settings card — audit retention and login keyword respectively; the KAH breach-email
  template cards live on the KAH Groups tab). `EventTypeForm` is a **3-column top
  row** at `lg` (`span {{ base: 12, sm: 6, lg: 4 }}` for Name/Acronym/Group — a
  `description` on every field keeps the columns equal height and aligned) over a
  2-column Time options/Allowed locations matrix, a **Locked location** select
  (skips the wizard Location step), a separate **Event form** block for the
  remarks/invitees toggles, and the color swatches.
- Modals widen one size step (1.7); settings pages wrap their content in
  `PageContainer` from `settings/layout.tsx`.

## 1.6 Parade State & Contacts

Both pages wrap their content in `PageContainer`; their card lists
(`ContactList`, `ParadeStateView`'s per-department user list) switch from
`<Stack gap="sm">` to a `<Box className="card-grid">`, so cards reflow into
`auto-fill` ≥300px columns at `36em` and ≥320px at `lg` (40em). With the
desktop shell now starting at 640px, the 36em early tier is effectively
vestigial (two 300px columns don't fit until ~644px, which is already
desktop); the ≥320px desktop grid shows 2 columns from ~800px (rail band)
and 3 from ~1024px. Beyond that, the floating buttons swap for inline
controls:

- **Contacts** — the search bar gains an `Export contacts`
  `Button visibleFrom="lg"` (same confirm modal as the FAB); the export FAB is
  `hiddenFrom="lg"`.
- **Parade State** — the attendance FAB toolbar is `hiddenFrom="lg"`; at `lg`
  the entry point stays the nav-row button beside the ⋮ menu.

FAB visibility is set via `hiddenFrom` on `FloatingToolbar` itself — its Affix
portals to `<body>`, so wrapper elements cannot hide it (see the gotcha in 1.4).

## 1.7 Modal sizes

Modals stay **floating centered dialogs** (never `fullScreen`) at every width;
only the `size` steps at each breakpoint (detected with `useMediaQuery` inside
the client components). The compact tier (§1.10) drops the mobile sizes one
step so the dialog never approaches the viewport edge:

| Modal | Compact ≤ 360px | Mobile | At `lg` |
| ----- | --------------- | ------ | ------- |
| Event form (`DashboardView`) | `xs` (320px) | `sm` (380px) | `md` (440px) |
| Event detail (`EventDetail`) | `xs` | `sm` | `md` |
| Agenda day modal | `xs` | `sm` | `md` (max-height `56dvh` → `70dvh`) |
| Filter modal (`FilterModal`) | `xs` | `sm` | `md` |
| Date picker (`DateSelectorModal`) | `xs` | `sm` | `md` |
| User form | `md` | `md` | `lg` |
| Event type form | `sm` | `sm` | `lg` |
| Event search (`EventSearchModal`) | `sm` | `md` | `lg` |
| Pinned events (`PinnedEventsPanel`) | `sm` | `md` | `lg` |
| Audit detail (`LogDetailModal`) | `md` | `md` | `lg` |

`EventDetail`'s shrink animation sizes off the same value through
`modalContentWidth(viewport, sizePx)` in `src/lib/motion/origin.ts`
(`smModalContentWidth` = `modalContentWidth(viewport, 380)`); every component
that animates now passes the same `isNarrow`-aware pixel width (320/380/440/620)
that its `size` prop resolves to, so the shrink stays in sync at every tier.

The event form's **Timestamp step** pairs Start/End side by side in a 2-column
`Grid` at `lg` (both the range pickers and the full-day date+AM/PM pairs).

## 1.8 Login & PWA

- `LoginForm` card: `maw={{ base: 380, lg: 440 }}`.
- `src/app/manifest.ts`: `orientation: "any"` (was `"portrait"`) so an installed
  PWA on a tablet/desktop is not forced to portrait.

## 1.9 File index

| File | Role |
| ---- | ---- |
| `src/app/globals.css` | `@media (min-width: 36em)` (card-grid ≥300px) + `@media (min-width: 40em)` block: offset vars, `.page-container`, `.card-grid` ≥320px |
| `src/lib/theme.ts` | `breakpoints.lg: "40em"`; `DESKTOP_MEDIA_QUERY` (40em) + `DESKTOP_WIDE_MEDIA_QUERY` (50em, full-sidebar band) + `NARROW_MEDIA_QUERY` (compact tier) |
| `src/components/AppShellShell.tsx` | Navbar (240px ↔ 64px rail, `breakpoint: "lg"`, remembered via `sidebarCollapsed`, auto-collapsed entering the 640–799px band), footer `collapsed: isDesktop`, standalone viewport sync (skips `--app-shell-footer-offset` at desktop), compact header/nav via `isNarrow`, `.app-shell-root` |
| `src/components/PageContainer.tsx` | 1200px-centered wrapper |
| `src/components/FloatingToolbar.tsx` | Default `bottomOffset` = `var(--app-floating-bottom-offset)` |
| `src/lib/bottomNav.ts` | `BOTTOM_NAV_HEIGHT` / `BOTTOM_NAV_HEIGHT_CSS` (floating offset var moved to CSS) |
| `src/app/(protected)/settings/layout.tsx` | `.settings-page-pad` wrapper + `PageContainer` |
| `src/app/(protected)/settings/SettingsTabs.tsx` | Fixed strip < `lg`, sticky top row ≥ `lg` |
| `src/app/(protected)/settings/users/UserTable.tsx` | Cards < `lg`, `Table` ≥ `lg` |
| `src/app/(protected)/settings/departments/DepartmentTable.tsx` | Cards < `lg`, `Table` ≥ `lg` |
| `src/app/(protected)/settings/event-types/EventTypeTable.tsx` | Cards < `lg`, `Table` ≥ `lg` |
| `src/app/(protected)/settings/audit-log/AuditLogView.tsx` | Menu filters < `lg`, inline bar + `Table` ≥ `lg` |
| `src/app/(protected)/settings/users/UserForm.tsx` | 2-col `Grid` at `lg` |
| `src/app/(protected)/settings/event-types/EventTypeForm.tsx` | 2-col `Grid` at `lg` |
| `src/app/(protected)/settings/templates/TemplatesForm.tsx` | Side-by-side cards at `lg` |
| `src/app/(protected)/settings/general/SettingsForm.tsx` | Side-by-side cards at `lg` |
| `src/app/(protected)/dashboard/DashboardView.tsx` | Schedule label/slot widths, header New-event button, hidden FAB, modal sizes (`isNarrow` → `xs`) |
| `src/app/(protected)/dashboard/WeekMatrixView.tsx` | MOBILE_/DESKTOP_ label widths, responsive `contentMinWidth`/`labelLeft` |
| `src/app/(protected)/dashboard/EventForm.tsx` | Timestamp step 2-col at `lg` |
| `src/app/(protected)/dashboard/EventDetail.tsx`, `src/components/FilterModal.tsx`, `src/components/DateSelectorModal.tsx` | `xs` → `sm` → `md` (compact/mobile/lg) |
| `src/components/EventSearchModal.tsx`, `src/components/PinnedEventsPanel.tsx`, `src/components/UserSelectModal.tsx` | Modal sizes via `isNarrow`/`isDesktop` |
| `src/lib/motion/origin.ts` | `modalContentWidth(viewport, sizePx)` |
| `src/app/(protected)/contacts/page.tsx` + `ContactList.tsx` | `PageContainer` + `.card-grid` |
| `src/app/(protected)/parade-state/page.tsx` + `ParadeStateView.tsx` | `PageContainer` + `.card-grid` |
| `src/components/LoginForm.tsx` | `maw={{ base: 380, lg: 440 }}` |
| `src/app/manifest.ts` | `orientation: "any"` |

## 1.10 Compact tier

Very small form-factor phones (≤ 360px) overflow the mobile layout's
fixed-width chrome: the header's brand + button row, the bottom nav's text
labels under 4-5 items, and `sm` modals at the viewport edge. The **compact
tier** tightens these with the `isNarrow` flag — `useMediaQuery(NARROW_MEDIA_QUERY)`
(`(max-width: 22.5em)` from `src/lib/theme.ts`) — mirroring how `isDesktop`
drives the wide layout:

| Surface | Regular mobile | Compact ≤ 360px |
| ------- | -------------- | ---------------- |
| Header gutters | `px="md"`, `gap="md"` | `px="xs"`, `gap` 4 (both `wrap="nowrap"`) |
| Pinned-events ticker | pill with count chip + rotating title (CSS max-width tier) | same pill — the removed logo freed the space |
| Bottom nav | icon + text label per item | icon only (`NavButton` `compact`; `aria-label` preserved) |
| Modals (event form/detail, agenda, filter, date picker) | `sm` | `xs` |
| Modals (event search, pinned events) | `md` | `sm` |
| Shrink-animation widths | 380/440/620px per modal | same values via the `isNarrow` branch in `modalContentWidth(...)` |

Deliberate limits:

- **Not a Mantine breakpoint.** `NARROW_MEDIA_QUERY` is a JS-only query with no
  theme counterpart, so it can't collide with `xs:` responsive props (those mean
  ≥ 576px) or the `lg:` breakpoint. It can only be consumed by `useMediaQuery`
  (and would need a JS match for any CSS mirror).
- **Shell chrome only.** The compact tier is scoped to the persistent shell and
  the shared modals — the things that overflow at every route. Page content
  (cards, forms, grids) already reflows fluidly down to the grid's internal
  minimums (the Month grid scrolls past 588px inside its own ScrollArea), so
  pages need no per-view narrowing.
- **A11y preserved.** Icon-only nav buttons keep their `aria-label`, and the
  pinned-events ticker always carries its count in the accessible name (the
  visual chip is `aria-hidden`), so the compact tier loses no announceable
  context.

## 1.11 Related docs

- [ui-state.md](ui-state.md) — remembered page/tab/filter state (the nav items
  both the sidebar and the bottom nav render).
- [loading-transitions.md](loading-transitions.md) — skeletons/fades are
  breakpoint-agnostic and unchanged by this design.
- [events-cache.md](events-cache.md) — the data layer behind the dashboard
  views; untouched by the responsive work.
