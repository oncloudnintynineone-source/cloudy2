# Glossary

The project's domain language. Each term names a concept the codebase models; use these
names in code, docs, and reviews.

## Table of contents

- [1. Dashboard navigation](#1-dashboard-navigation)
- [2. Settings write](#2-settings-write)
- [3. Dashboard snapshot](#3-dashboard-snapshot)

## 1. Dashboard navigation

The decision module that answers, for the calendar page: *given the URL and the held
snapshot, which tab and period are displayed, is the held data sufficient, and does this
navigation require a fetch?* It is pure and client-safe (`src/lib/dashboard/navigation.ts`),
owning the fetch/display decision so `DashboardScreen` and `DashboardView` are thin
adapters. A **tab switch** is planned through the same module (`planDashboardSwitch`), so
the rule that decides "does a tap refetch?" lives once.

Related: **dashboard snapshot** (the serializable data a snapshot carries, cached in
IndexedDB — `src/lib/dashboard/snapshot.ts`).

## 2. Settings write

The ritual every admin Settings edit runs against the singleton `settings` row:
authorize, read the before-row, apply the patch, audit the diff, invalidate the config
cache, and revalidate the affected paths. It lives once (`editSetting`,
`src/lib/settings/write.ts`); the pure per-field patch and targets live in
`src/lib/settings/edits.ts`. A **settings write** is therefore one implementation with
N field adapters, not N copies of the plumbing.

## 3. Dashboard snapshot

The serializable data the Calendar page renders, cached in the device's IndexedDB so a
cold PWA open paints the last-known grid instantly and revalidates in the background. Its
shape is **owned by** `src/lib/dashboard/snapshot.ts` as `DashboardSnapshot` (a deliberate
versioned contract), not derived from a component's props; the view adds its own
view-local fields (URL period, zoom seeds, deep-link ids). Device-local one-shot state is
excluded — the record carries its resolved period in the snapshot context.
