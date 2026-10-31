# 1. Feature Flags

Admin-controlled, org-wide switches that let UI variants be tested **live** before
one is shipped as the default. Two flags remain live: the post-save event
confirmation's presentation and the app-wide motion cadence. Five earlier flags
have finished their trial and are now **locked in** — their winning variants are
fixed in code (`LOCKED_VARIANTS` in `src/lib/settings/featureFlags.ts`), their
settings columns and controls are gone, and consumers read the constant instead.
New flags join the same registry (Settings → Feature Flags, last strip tab).

## Table of contents

- [1.1 Purpose](#11-purpose)
- [1.2 The registry](#12-the-registry)
- [1.3 The Settings page](#13-the-settings-page)
- [1.4 Adding a new flag](#14-adding-a-new-flag)
- [1.5 Locked-in variants](#15-locked-in-variants)
- [1.6 File index & related docs](#16-file-index--related-docs)

## 1.1 Purpose

- **Global, not per-user.** A flag applies to every signed-in user the moment an
  admin saves it — the header/admin surface is the place to compare variants in
  the real app head, then keep the winner. There is no per-user override.
- **Isolated surface.** Flags are small, presentational/behavioral knobs; their
  resolved values are never part of audit payloads, dashboard filters, KAH
  computations or any cached event read.
- All toggles are audited as a normal `settingsUpdate` (**Settings → Audit Log**),
  so flipping a variant on/off while testing is fully recorded.
- **Retiring a flag** means promoting its winner to a fixed constant, removing
  its control and settings column, and leaving the other variant implementations
  in code (unreachable through configuration). See §1.5.

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
toast). Today it shows **Saved-event confirmation** and **Motion profile**; the
motion flag also carries the live animation preview. `FeatureFlagsForm` owns the
preview renderers keyed by flag key — the control rendering itself needs no
change when a flag is added.

## 1.4 Adding a new flag

1. **Add the column** to `settings` in `src/db/schema.ts` (typed, `notNull()`
   with a default matching the registry default), then `pnpm db:generate` and
   commit the migration + `drizzle/meta/` alongside the code.
2. **Register it** in `src/lib/settings/featureFlags.ts` with a
   `FeatureFlagDef` (the flag constant pattern: `savedEventToastVariantFlag`).
   `FEATURE_FLAGS` picks it up automatically.
3. **Ship it somewhere**: read it via `getFeatureFlags()`/`SettingsView.featureFlags`
   and pass it down (the shell's header receives its values as props from the
   `(protected)` layout, resolved through the registry — see
   [`pinned-events.md`](pinned-events.md) §1.4; the dashboard's event-save
   confirmation travels through `DashboardSharedConfig` into `EventForm` — see
   [`action-pill.md`](action-pill.md)).
4. **Preview (optional)**: add a renderer to `FeatureFlagsForm.previewFor`.

Run `pnpm test -- src/lib/settings/featureFlags.test.ts` (registry invariants +
normalization) and the full quality gates before pushing.

## 1.5 Locked-in variants

These flags were compared live and then retired. `LOCKED_VARIANTS` in
`src/lib/settings/featureFlags.ts` is the single source of truth; the old
`settings` columns are dropped by migration `0065`.

| Retired flag | Locked value | Behavior |
| --- | --- | --- |
| `pinnedTickerIndicator` | `split` | Split pill — amber counter + blue countdown in one two-tone leading token. |
| `translucencyLevel` | `subtle` | The most see-through frosted-glass level for overlapping page surfaces. |
| `reorderDrag` | `drag` | Drag-handle-only reordering (the keyboard path is the handle's Space/Enter + arrow keys). |
| `bottomNavVariant` | `tight` | 72px mobile scrolling-rail tiles. |
| `wizardStepIndicator` | `guided` | Labels + step list — desktop labels, compact mobile step list. |

The other variant implementations remain in the components for a future
experiment, but no setting can select them.

## 1.6 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/settings/featureFlags.ts` | Registry (defs, resolve/normalize/validate, types, `LOCKED_VARIANTS`) |
| `src/lib/settings/featureFlags.test.ts` | Registry invariants + normalization tests |
| `src/lib/settings/queries.ts` | `getFeatureFlags` + `SettingsView.featureFlags` |
| `src/lib/settings/{write,edits}.ts` | `updateFeatureFlags` through the shared settings-write ritual (`editSetting`) + the pure flag edit (audited, cache-invalidating) |
| `src/app/(protected)/settings/feature-flags/` | Page + generic `FeatureFlagsForm` + skeleton |
| `src/app/(protected)/layout.tsx` | Resolves the shell-facing flags and the `motionProfile` into the shell (publishes the motion CSS vars + wraps in `MotionProvider`); passes the locked ticker/translucency/rail values |
| `src/lib/bottomNav.ts` | `footerPrimaryFor` — the pure rail tile rule (unit-tested in `bottomNav.test.ts`) |
| `src/lib/dashboard/data.ts` | Resolves the dashboard-facing `savedEventToastVariant` into `DashboardSharedConfig`; uses the locked reorder/wizard values |

Related docs:

- [`pinned-events.md`](pinned-events.md) — the header pill (now locked to the
  split indicator).
- [`action-pill.md`](action-pill.md) — the `savedEventToastVariant` flag: the four
  post-save confirmation variants and the action pill's `toast` presentation.
- [`dashboard-views.md`](dashboard-views.md) §1.1 — the locked `subtle`
  translucent surfaces.
- [`reorder.md`](reorder.md) — the shared drag-to-reorder plumbing (locked to
  drag-only).
- [`desktop-responsive.md`](desktop-responsive.md) §1.2 — the always-scrolling
  mobile footer rail, locked to the 72px tile width.
- [`motion.md`](motion.md) — the `motionProfile` flag: the app-wide animation
  system (durations, easings, distances, stagger) and its four profiles.
- [`event-lifecycle.md`](event-lifecycle.md) §1.4 — the wizard's locked
  labels + step list presentation.
- [`audit-log.md`](audit-log.md) — how admin writes are recorded.
