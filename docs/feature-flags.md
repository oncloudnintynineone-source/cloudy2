# 1. Feature Flags

Admin-controlled, org-wide switches that let UI variants be tested **live** before
one is shipped as the default. Today it owns the pinned-events header ticker's
indicator style, the post-save event confirmation's presentation, the app-wide
frosted-glass `translucencyLevel`, and the manageable lists' reorder interaction
(drag-only default, arrows + drag, or arrows only); new flags join the same
registry (Settings → Feature Flags, last strip tab).

## Table of contents

- [1.1 Purpose](#11-purpose)
- [1.2 The registry](#12-the-registry)
- [1.3 The Settings page](#13-the-settings-page)
- [1.4 Adding a new flag](#14-adding-a-new-flag)
- [1.5 File index & related docs](#15-file-index--related-docs)

## 1.1 Purpose

- **Global, not per-user.** A flag applies to every signed-in user the moment an
  admin saves it — the header/admin surface is the place to compare variants in
  the real app head, then keep the winner. There is no per-user override.
- **Isolated surface.** Flags are small, presentational/behavioral knobs; their
  resolved values are never part of audit payloads, dashboard filters, KAH
  computations or any cached event read.
- All toggles are audited as a normal `settingsUpdate` (**Settings → Audit Log**),
  so flipping a variant on/off while testing is fully recorded.

## 1.2 The registry

`src/lib/settings/featureFlags.ts` is the single source of truth — a pure,
I/O-free list of typed definitions:

```ts
interface FeatureFlagDef<TOption extends string> {
  key: string;          // must equal the settings column name (camelCase)
  label: string;        // control label on the Feature Flags page
  description: string;
  options: readonly TOption[];        // closed set of allowed values
  optionLabels: Record<TOption, string>; // SegmentedControl captions
  defaultValue: TOption;
}
```

- `key` must match the Drizzle column the value is stored in — that is how
  `getFeatureFlags`/`updateFeatureFlags` read and write without a per-flag
  switch in the page.
- `resolveFlagValue` enforces the closed set: a non-string or an option outside
  `options` falls back to `defaultValue`, so a stale or hand-edited row can
  never reach the client as an invalid value.
- All reads flow through the 60 s-cached singleton settings row
  (`src/lib/settings/queries.ts`); admin saves call `invalidateConfigCache`
  first, so the next read — and the **header's next render after
  `router.refresh()`** — already reflects the new flag.

## 1.3 The Settings page

`/settings/feature-flags` (admin-only, last strip tab) renders the registry
generically: one `SegmentedControl` per registered flag (label + description),
a **Save** button in the standard form pattern (`validateInputOnBlur`,
button-local loading, amber activity-bar refresh on success, validation-failure
toast). Each flag may also register a live preview (the pinned-events flag shows
a mock of the real header pill that switches with the selected option).
`FeatureFlagsForm` owns the preview renderers keyed by flag key — the control
rendering itself needs no change when a flag is added.

## 1.4 Adding a new flag

1. **Add the column** to `settings` in `src/db/schema.ts` (typed, `notNull()`
   with a default matching the registry default), then `pnpm db:generate` and
   commit the migration + `drizzle/meta/` alongside the code.
2. **Register it** in `src/lib/settings/featureFlags.ts` with a
   `FeatureFlagDef` (the flag constant pattern: `pinnedTickerIndicatorFlag`).
   `FEATURE_FLAGS` picks it up automatically.
3. **Ship it somewhere**: read it via `getFeatureFlags()`/`SettingsView.featureFlags`
   and pass it down (the shell's header receives it as a prop from the
   `(protected)` layout, resolved through the registry — see
   [`pinned-events.md`](pinned-events.md) §1.4; the dashboard's event-save
   confirmation travels through `DashboardSharedConfig` into `EventForm` — see
   [`action-pill.md`](action-pill.md)).
4. **Preview (optional)**: add a renderer to `FeatureFlagsForm.previewFor`.

Run `pnpm test -- src/lib/settings/featureFlags.test.ts` (registry invariants +
normalization) and the full quality gates before pushing.

## 1.5 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/settings/featureFlags.ts` | Registry (defs, resolve/normalize/validate, types) |
| `src/lib/settings/featureFlags.test.ts` | Registry invariants + normalization tests |
| `src/lib/settings/queries.ts` | `getFeatureFlags` + `SettingsView.featureFlags` |
| `src/lib/settings/actions.ts` | `updateFeatureFlags` (audited, cache-invalidating) |
| `src/app/(protected)/settings/feature-flags/` | Page + generic `FeatureFlagsForm` + skeleton |
| `src/app/(protected)/layout.tsx` | Resolves the header-facing flags into the shell |
| `src/lib/dashboard/data.ts` | Resolves the dashboard-facing flags (`savedEventToastVariant`, `translucencyLevel`, `reorderDrag`) into `DashboardSharedConfig` |

Related docs:

- [`pinned-events.md`](pinned-events.md) — the first flag (`pinnedTickerIndicator`)
  and its five variants in the header pill.
- [`action-pill.md`](action-pill.md) — the `savedEventToastVariant` flag: the four
  post-save confirmation variants and the action pill's `toast` presentation.
- [`dashboard-views.md`](dashboard-views.md) §1.1 — the `translucencyLevel` flag:
  the app-wide frosted glass and its three opacity levels.
- [`reorder.md`](reorder.md) — the `reorderDrag` flag: the shared drag-to-reorder
  plumbing and the lists it upgrades.
- [`audit-log.md`](audit-log.md) — how admin writes are recorded.