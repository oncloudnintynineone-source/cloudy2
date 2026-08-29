# 1. Quick Links

Quick Links are admin-managed shortcut links shown on the Calendar page (Settings →
Quick Links tab). An amber launcher opens a menu of the enabled links; each item
opens its URL in a new tab.

## Table of contents

- [1.1 Data model](#11-data-model)
- [1.2 CRUD, reorder & validation](#12-crud-reorder--validation)
- [1.3 Icon registry & components](#13-icon-registry--components)
- [1.4 The launcher & menu](#14-the-launcher--menu)
- [1.5 File index & related docs](#15-file-index--related-docs)

## 1.1 Data model

`quick_links` table (`src/db/schema.ts:219`): `label`, `url`, `icon` (key into the
curated tabler icon set, default `external-link`), `color` (Mantine palette name
tinting the menu item's icon), `enabled`, `sortOrder` (indexed). The menu lists
enabled rows in `sortOrder` order; the launcher only appears when at least one row is
enabled.

## 1.2 CRUD, reorder & validation

- CRUD + reorder in `src/lib/quickLinks/actions.ts` — every mutation is audited
  (`quickLink.*`) and revalidates `/settings/quick-links` + `/dashboard`.
  `moveQuickLink` renumbers to unique ascending `sortOrder` inside its transaction.
- Validation in `src/lib/quickLinks/validate.ts` — **http/https URLs only**
  (unit-tested).
- Reads: `src/lib/quickLinks/queries.ts` (enabled rows ordered by `sortOrder`);
  `page.tsx` (dashboard) passes only **enabled** links to `DashboardView` (the
  `quickLinks` prop).

## 1.3 Icon registry & components

- The curated icon registry is **pure** in `src/lib/quickLinks/icons.ts` (keys +
  labels, unit-tested).
- Icon components are client-only: `QuickLinkIcon` (renders a key), 
  `QuickLinkIconPicker` (a tappable icon button grid — **never a Select**),
  `QuickLinksMenu` (the dropdown).

## 1.4 The launcher & menu

- The launcher is a deliberately non-customizable **amber `IconLink`** — never grey
  dots, it must not blend with the "More options" kebab.
  - Mobile: light-`accent` FAB beside the "New event" FAB.
  - `lg`: light-`accent` 36px nav-row chip labelled "Quick links".
- Renders only when the list is non-empty and **always opens the menu** (never a
  direct link).
- Items are page-scale (16px text, ~44px rows) and open their URL in a new tab; the
  dropdown pops from the anchored corner like the kebab menu.

## 1.5 File index & related docs

| File | Role |
| ---- | ---- |
| `src/db/schema.ts` | `quick_links` table |
| `src/lib/quickLinks/actions.ts` | Audited CRUD + `moveQuickLink` reorder |
| `src/lib/quickLinks/queries.ts` | Enabled-links read |
| `src/lib/quickLinks/icons.ts` | Curated icon registry (pure) |
| `src/lib/quickLinks/validate.ts` | http/https URL validation (pure) |
| `src/components/QuickLinkIcon.tsx`, `QuickLinkIconPicker.tsx`, `QuickLinksMenu.tsx` | Client-only icon + menu components |

Related docs:

- [`dashboard-views.md`](dashboard-views.md) — the Calendar page hosting the launcher.
