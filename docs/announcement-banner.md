# 1. Announcement banner

An admin-managed persistent banner above the navy header bar, visible to all
signed-in users (Settings → Banner tab). Disabled means the steady-state layout is
exactly as if the feature weren't there — no reserved space.

## Table of contents

- [1.1 Configuration](#11-configuration)
- [1.2 Curated palette & validation (pure)](#12-curated-palette--validation-pure)
- [1.3 Rendering & the height-var chain](#13-rendering--the-height-var-chain)
  - [1.3.1 Known from first paint — no reservation trade-off](#131-known-from-first-paint--no-reservation-trade-off)
- [1.4 Interplay with immersive mode](#14-interplay-with-immersive-mode)
- [1.5 File index & related docs](#15-file-index--related-docs)

## 1.1 Configuration

Config lives on the singleton `settings` row: `banner_enabled` / `banner_text` /
`banner_color`. The audited `updateBanner` action revalidates `/settings/banner`.

The banner is **resolved by the layout, not streamed**: `(protected)/layout.tsx`
runs `Promise.all([requireSession(), getBanner()])` and passes the resolved
config into `AppShellShell` as the `bannerConfig` prop. The session is a JWT
decode (no DB); `getBanner()` is one cheap SELECT on the singleton settings row
(per-request deduped via React `cache`). Reading it up front means the shell
knows the banner state on its **very first render** — the header (banner above
the navy bar, or the bare 56px bar) and the route skeleton are aligned with the
steady-state layout from first paint, with no post-hydration jump. Only the KAH
nav probe is still streamed. (Historically the banner was streamed so the
layout never awaited a Neon scale-to-zero DB read before painting the shell —
superseded once the PWA launch shell began painting unconditionally from the
precache, [`pwa-offline.md`](pwa-offline.md) §1.5.1.)

## 1.2 Curated palette & validation (pure)

`src/lib/banner/banner.ts` is pure and unit-tested:

- `BANNER_COLORS` — curated background palette (Navy/brand, Amber/accent, red, green,
  orange, violet, cyan). **Admins pick swatches, never color codes**; each entry pins
  its readable text color (`light` = white on filled, `dark` = near-black).
- `normalizeBannerColor` — unknown stored values fall back to the default (brand).
- `BANNER_TEXT_MAX_LENGTH` = 200; `validateBannerForm` — an enabled banner needs text
  within the cap; a disabled one only needs its kept text to stay within the cap so
  re-enabling can't be blocked by stale content.
- `BANNER_HEIGHT_PX` = 25 — the fixed min-height.

## 1.3 Rendering & the height-var chain

`AnnouncementBanner` lives in `src/components/ShellChrome.tsx` (exported) and is
rendered directly by `AppShellShell` inside `AppShell.Header` above the brand
bar whenever the `bannerConfig` prop is non-null:

- Fixed 25px min-height; grows taller when text wraps. Full text available on hover
  via `title`.
- It **measures its own height after layout** and reports it through the
  `ShellChromeContext` (provided by `AppShellShell`) into `--app-banner-height`,
  set **inline** on the AppShell root. The `calc(56px + var(--app-banner-height))`
  chain lives on `.app-shell-root` in `src/app/globals.css` — no class toggling —
  so main padding, navbar and all sticky chrome follow automatically.

### 1.3.1 Known from first paint — no reservation trade-off

Because the layout resolves the config before the shell renders
(`bannerConfig` prop → `bannerActive = bannerConfig !== null`), there is **no
pending state to guess about**:

- A **configured** banner is present in the very first SSR render — the header
  carries the banner (with its inline `--app-banner-height`) and the route
  skeleton is already positioned for it. No shift when the read "lands" (there
  is no read to land).
- A **null** config leaves the bare 56px bar — nothing is ever reserved, so a
  no-banner deployment never flashes a phantom gap or collapses it.

This deliberately avoids the old trade-off between the two failure modes: the
streamed design either reserved the banner height while pending (a configured
banner aligned, but a null resolve collapsed a phantom gap — a 56→81→56 double
shift on every load) or reserved nothing (no gap, but a configured banner grew
the header mid-load and pushed the skeleton down). Seeding the resolved config
from the server eliminates the guess entirely.

```mermaid
sequenceDiagram
 participant L as (protected) layout
 participant S as AppShellShell
 L->>L: Promise.all(requireSession(), getBanner())
 L-->>S: bannerConfig prop (config | null)
 alt config present
 S->>S: header = banner + 56px bar from first render<br/>(--app-banner-height inline)
 Note over S: route skeleton already aligned — no post-hydration jump
 else config null
 S->>S: bare 56px bar; nothing reserved, nothing to collapse
 end
```

> **Do NOT pass the height via Mantine's `vars` prop** — in v9 that is a resolver
> *function*, not an object.

## 1.4 Interplay with immersive mode

Null resolve = collapse to today's layout exactly. Immersive mode
([`immersive-mode.md`](immersive-mode.md)) omits both the inline style and the header
height contribution, so the CSS-default 0px applies and Mantine allocates no phantom
main-content padding.

## 1.5 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/banner/banner.ts` | Palette, normalization, validation (pure) |
| `src/app/(protected)/layout.tsx` | Resolves `getBanner()` in parallel with the session; passes `bannerConfig` to the shell as a prop |
| `src/components/ShellChrome.tsx` | `AnnouncementBanner` (exported), `ShellChromeContext` (client) |
| `src/components/AppShellShell.tsx` | Derives `bannerActive` from the `bannerConfig` prop, renders the banner, height-var wiring |
| `src/app/globals.css` | `.app-shell-root` height chain |

Related docs:

- [`immersive-mode.md`](immersive-mode.md) — fullscreen interplay.
- [`loading-transitions.md`](loading-transitions.md) — the skeleton/first-paint
  sequence the banner joins (now aligned from first paint).