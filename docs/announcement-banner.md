# 1. Announcement banner

An admin-managed persistent banner above the navy header bar, visible to all
signed-in users (Settings → Banner tab). Disabled means the steady-state layout is
exactly as if the feature weren't there — no reserved space.

## Table of contents

- [1.1 Configuration](#11-configuration)
- [1.2 Curated palette & validation (pure)](#12-curated-palette--validation-pure)
- [1.3 Rendering & the height-var chain](#13-rendering--the-height-var-chain)
  - [1.3.1 Reserved while pending, collapses when absent](#131-reserved-while-pending-collapses-when-absent)
- [1.4 Interplay with immersive mode](#14-interplay-with-immersive-mode)
- [1.5 File index & related docs](#15-file-index--related-docs)

## 1.1 Configuration

Config lives on the singleton `settings` row: `banner_enabled` / `banner_text` /
`banner_color`. The audited `updateBanner` action revalidates `/settings/banner`.

The banner is **streamed**, not block-read: `(protected)/layout.tsx` no longer awaits
DB work before rendering the AppShell. That matters for first paint — the layout's DB
reads used to sit in front of every protected route's `loading.tsx`, so a Neon
scale-to-zero cold start kept the browser from painting anything (and the Android PWA
splash from dismissing) for the whole wake-up. Instead the layout renders
`<Suspense fallback={<BannerPlaceholder />}><ShellBanner /></Suspense>` as the
`bannerSlot` prop of `AppShellShell`; `ShellBanner` awaits `getBanner()` (per-request
deduped via React `cache`) and resolves to `BannerLoaded`. The shell + route skeleton
paint immediately, and the banner streams in when the read lands.

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

`AnnouncementBanner` lives in `src/components/ShellChrome.tsx` and renders inside
`AppShell.Header` above the brand bar, mounted by the streamed `BannerLoaded`:

- Fixed 25px min-height; grows taller when text wraps. Full text available on hover
  via `title`.
- It **measures its own height after layout** and reports it through the
  `ShellChromeContext` (provided by `AppShellShell`) into `--app-banner-height`,
  set **inline** on the AppShell root. The `calc(56px + var(--app-banner-height))`
  chain lives on `.app-shell-root` in `src/app/globals.css` — no class toggling —
  so main padding, navbar and all sticky chrome follow automatically.

### 1.3.1 Reserved while pending, collapses when absent

`AppShellShell` reserves the banner slot from the first paint (`bannerActive`
defaults true; the Suspense fallback `BannerPlaceholder` is a 25px spacer). That
guarantees a configured banner never shifts the header when its DB read resolves
late (cold start). `BannerLoaded` reports the resolved presence in a **layout
effect**: a null result collapses the reserved space back to the bare 56px bar
before the browser paints, so warm no-banner loads never flash the gap.

```mermaid
sequenceDiagram
    participant L as (protected) layout
    participant S as AppShellShell
    participant B as ShellBanner → getBanner()
    L->>S: bannerSlot = <Suspense fallback={BannerPlaceholder}>
    S->>S: bannerActive=true (reserves 25px); header + route skeleton stream
    Note over S: first paint — splash dismissed, no DB waited on
    B-->>S: resolve → BannerLoaded(config | null)
    alt config present
        S->>S: AnnouncementBanner fills slot; measures height → --app-banner-height
    else config null
        S->>S: layout effect collapses slot before paint
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
| `src/app/(protected)/shellStream.tsx` | `ShellBanner` (awaits `getBanner()`), `BannerPlaceholder` — streamed into the shell via Suspense |
| `src/components/ShellChrome.tsx` | `AnnouncementBanner`, `BannerLoaded`, `ShellChromeContext` (client) |
| `src/components/AppShellShell.tsx` | Reserves/collapses the banner slot, height-var wiring |
| `src/app/globals.css` | `.app-shell-root` height chain |

Related docs:

- [`immersive-mode.md`](immersive-mode.md) — fullscreen interplay.
- [`loading-transitions.md`](loading-transitions.md) — the skeleton/first-paint
  sequence the streamed banner joins.