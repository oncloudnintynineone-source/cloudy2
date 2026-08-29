# 1. Announcement banner

An admin-managed persistent banner above the navy header bar, visible to all
signed-in users (Settings → Banner tab). Disabled means the layout is exactly as if
the feature weren't there — no reserved space.

## Table of contents

- [1.1 Configuration](#11-configuration)
- [1.2 Curated palette & validation (pure)](#12-curated-palette--validation-pure)
- [1.3 Rendering & the height-var chain](#13-rendering--the-height-var-chain)
- [1.4 Interplay with immersive mode](#14-interplay-with-immersive-mode)
- [1.5 File index & related docs](#15-file-index--related-docs)

## 1.1 Configuration

Config lives on the singleton `settings` row: `banner_enabled` / `banner_text` /
`banner_color`. The audited `updateBanner` action revalidates `/settings/banner`.
The protected layout reads `getBanner()` (per-request deduped via React `cache`) and
passes it to `AppShellShell`.

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

`AnnouncementBanner` (a function inside `AppShellShell.tsx`) renders inside
`AppShell.Header` above the brand bar:

- Fixed 25px min-height; grows taller when text wraps. Full text available on hover
  via `title`.
- It **measures its own height after layout** and feeds the value into
  `--app-banner-height` **inline** on the AppShell root. The
  `calc(56px + var(--app-banner-height))` chain lives on `.app-shell-root` in
  `globals.css` — no class toggling — so main padding, navbar and all sticky chrome
  follow automatically.

> **Do NOT pass the height via Mantine's `vars` prop** — in v9 that is a resolver
> *function*, not an object.

## 1.4 Interplay with immersive mode

Disabled = null = today's layout exactly. Immersive mode
([`immersive-mode.md`](immersive-mode.md)) omits both the inline style and the header
height contribution, so the CSS-default 0px applies and Mantine allocates no phantom
main-content padding.

## 1.5 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/banner/banner.ts` | Palette, normalization, validation (pure) |
| `src/components/AppShellShell.tsx` | `AnnouncementBanner`, height measurement, inline var |
| `src/globals.css` | `.app-shell-root` height chain |

Related docs:

- [`immersive-mode.md`](immersive-mode.md) — fullscreen interplay.
