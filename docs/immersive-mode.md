# 1. Fullscreen calendar (immersive mode)

Immersive mode is the Calendar's focus mode: a toggle hides the shell header, bottom
nav and desktop sidebar, and requests the page-level Fullscreen API so the OS status
bar / browser UI go too. State is owned by the AppShell (it renders the chrome being
hidden); only the dashboard controls it.

## Table of contents

- [1.1 The toggle & state ownership](#11-the-toggle--state-ownership)
- [1.2 The CSS half](#12-the-css-half)
- [1.3 Floating toolbars & iOS fallback](#13-floating-toolbars--ios-fallback)
- [1.4 Deliberate choices](#14-deliberate-choices)
- [1.5 File index & related docs](#15-file-index--related-docs)

## 1.1 The toggle & state ownership

- A floating circular button (`FullscreenToggle`, `src/components/FullscreenToggle.tsx`)
  anchored to the top-right of the calendar view — beside the zoom/pan cluster, not in the
  old kebab menu. It flips `IconArrowsMaximize` / `IconArrowsMinimize`
  ("Enter fullscreen" / "Exit fullscreen") and is always rendered (it is the in-page exit
  path while immersive).
- `enter()` flips the shell chrome off **and** requests the page-level Fullscreen API
  (`requestFullscreen({ navigationUI: "hide" })`), so the OS status bar / browser UI
  disappear on devices that support it.
- State lives in `AppShellShell` (it renders the chrome being hidden) and is exposed
  via `useImmersiveMode()` (`src/lib/ui/immersiveMode.ts`). **Only `DashboardView`
  controls it and always exits on unmount.**
- The shell's `fullscreenchange` listener follows `Esc` / the Android status-bar edge
  gesture, so leaving fullscreen outside the toggle still syncs state.

## 1.2 The CSS half

The CSS half is the `app-shell-immersive` class on the AppShell root
(`globals.css`):

- Hides the direct `<header>`/`<nav>`/`<footer>` children.
- Zeroes `--app-shell-header/navbar/footer-offset`. Declarations on the root div beat
  Mantine's `:root`-injected vars (the same mechanism as the 56px header offset), so
  the AppShell main padding and the sticky chrome / Week strips re-pin to the viewport
  edge with **no per-view changes**.

## 1.3 Floating toolbars & iOS fallback

- The dashboard's floating toolbars take the freed bottom-nav space: `FloatingToolbar`
  gets `bottomOffset="var(--app-floating-bottom-offset-immersive)"` while active — a
  `:root` var, because the Affix portals to `<body>`.
- Browsers that reject page fullscreen (iOS) keep the **CSS-only** mode — the sticky
  chrome then takes `env(safe-area-inset-top)` padding.

## 1.4 Deliberate choices

- **Not persisted** in `cloudy2.ui` — it is a transient focus mode; refresh /
  navigation always starts with the chrome up.
- **Dashboard chrome stays up**: only the shell chrome (header / bottom nav / desktop
  sidebar / banner) is hidden — the calendar's own view tabs, "All views" jump list,
  Add-view button and Manage-views gear remain visible so view switching and
  management still work in fullscreen.
- The announcement banner's inline height style and header contribution are omitted
  while immersive, so the CSS-default 0px applies ([`announcement-banner.md`](announcement-banner.md)).

## 1.5 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/ui/immersiveMode.ts` | `ImmersiveModeContext` + `useImmersiveMode` |
| `src/components/AppShellShell.tsx` | State owner, fullscreen listener, chrome hiding |
| `src/app/globals.css` | `app-shell-immersive` class + immersive bottom-offset var |

Related docs:

- [`dashboard-views.md`](dashboard-views.md) — the view that controls immersive mode.
- [`announcement-banner.md`](announcement-banner.md) — banner interplay.
