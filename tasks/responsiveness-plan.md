# Implementation Plan: Responsiveness of Database-Backed Actions

## Table of contents

- [1. Objective and scope](#1-objective-and-scope)
- [2. Baseline measurements](#2-baseline-measurements)
- [3. Bottleneck inventory](#3-bottleneck-inventory)
- [4. Workstreams](#4-workstreams)
- [5. Task list](#5-task-list)
- [6. Risks and mitigations](#6-risks-and-mitigations)
- [7. Verification](#7-verification)
- [8. Round 1 outcome](#8-round-1-outcome)
- [9. Round 2 outcome — view CRUD and the last RSC revalidation](#9-round-2-outcome--view-crud-and-the-last-rsc-revalidation)

## 1. Objective and scope

Reduce the wall-clock time between a user action and the app showing its result, for
actions that write to the database (and, for events, to Google Calendar). The two hot
paths called out by the user:

1. **Event create / edit / delete** — a server action that resolves participants, derives
   target department calendars, reads/writes Google Calendar copies, writes an audit row,
   invalidates the Google month cache and the pinned-selection cache, then lets the
   dashboard re-read its snapshot.
2. **Filter apply** (`saveDashboardViewFilters`) — a server action that persists a tab's
   filters, followed by a dashboard data re-read.

Secondary scope (surveyed, cheaper wins): dashboard view CRUD (rename/delete/reorder),
parade filters / week start, search-history writes, and any other server action whose
critical path serializes independent round trips.

Out of scope for this plan: Google Calendar read caching (already layered, see
`docs/events-cache.md`), dashboard rendering/animation work, and moving event copies to a
background queue (would break read-your-own-writes and the optimistic chip contract).

## 2. Baseline measurements

Environment: local dev machine, dev Neon (`ap-southeast-1`), dev Google service account.
Probes live in `.scratch/perf/` (`probe-db.mjs`, `probe-google.mjs`,
`probe-google-write.mjs`, `probe-actions.mjs`, `probe-event-actions.mjs`) and are
read-only except the write probes, which create far-future throwaway events and delete
every one in a `finally`.

| Measurement | Result |
|---|---|
| Neon per-statement round trip (warm) | **p50 2.3 ms**, p95 3.2 ms |
| Cold connect + first query | 119 ms |
| `events.list` — 1 calendar/month | **p50 747 ms** |
| `events.list` — 3 calendars serial | **p50 2115 ms** |
| `events.list` — 3 calendars concurrent | **p50 723 ms** |
| `events.insert` — 1 copy | ~1198 ms |
| `events.insert` — 3 copies serial | **p50 3593 ms** |
| `events.insert` — 3 copies concurrent | **p50 1346 ms** |

Derived per-mutation serial tails (p50 RTT × statements, excluding server CPU):

| Path | Serial DB statements | ≈ DB time |
|---|---|---|
| Event save post-Google tail (audit, epoch bump, cache delete, pinned delete, 2 name lookups) | 6 | ~14–17 ms |
| Event save target (2 name lookups overlapped with Google writes; tail parallel) | 1–2 | ~3–6 ms |
| Filter save today (ownership SELECT + UPDATE) + RSC revalidate | 2 | ~5 ms + RSC render |
| Filter save target (single UPDATE … RETURNING) | 1 | ~2–3 ms |

The decisive finding: **DB round trips are cheap (~2 ms); Google Calendar calls are
~750–1200 ms each and the write pipelines still ran them serially per copy.** A
three-department create serialized ~3.6 s of Google inserts that run in ~1.3 s
concurrently; a three-department edit added the same serial pattern on top of its copy
reads. The serial DB tail is small, but it is free to overlap.

## 3. Bottleneck inventory

### 3.1 Event create (`src/lib/events/actions.ts` `createEvent`)

- One `resolveGoogleCalendarId(target)` query **per target, serially** before each write
  (a batch helper, `resolveGoogleCalendarIds`, already existed and was used by
  update/delete).
- One `integration.createEvent` **per target, serially** in a `for` loop.
- `calendarNames` then `getUsersByIds` awaited **serially after** the writes.
- `logAction` → `invalidateGcalCache` (epoch bump + delete) → `invalidatePinnedCache`
  awaited **serially**; that is 4+ sequential DB statements on the response path.
- `appBaseUrl()` inside `buildGcalEventInput` per copy (cheap, but needless).

### 3.2 Event update (`performEventUpdate`)

- Copy reads were already bounded-concurrent (good).
- Read → write loop: updates/creates/deletes **serially per copy**.
- Name lookups after writes, then the same serial DB tail.
- `legacyFallback(ref)` awaited after target resolution instead of alongside it.

### 3.3 Event delete (`deleteEvent`)

- Copy reads concurrent; **deletes serial**; name lookups after deletes; same serial tail.

### 3.4 Registration toggle (`setEventRegistration` → `findRepresentativeCopy`)

- Probed each target calendar **serially** and stopped at the first hit; a later-target
  copy cost N × ~750 ms.

### 3.5 Filter apply (`src/lib/dashboardViews/actions.ts` `saveDashboardViewFilters`)

- `requireOwnedView` SELECT, then UPDATE — two round trips where one
  `UPDATE … WHERE id AND user_id RETURNING` suffices.
- `revalidatePath("/dashboard")` ran a full RSC re-render of the dashboard route
  (layout + thin page shell) as part of the action response. The dashboard's data comes
  from `/api/dashboard/load` and the client already calls `revalidate()` afterwards, so
  this re-render is redundant for the tab data.
- The filter dialog held its spinner until the action resolved; optimistic close was
  considered but not needed once the server leg was trimmed.

### 3.6 Other DB-backed actions (surveyed)

- View rename/kind/delete/reorder: SELECT(s) + UPDATE/DELETE, each with
  `revalidatePath`; reorder issued one UPDATE per row in a transaction.
- Create view: `ensureDefaultDashboardView` (a lock/upsert/count transaction) + count +
  sort-order SELECT + INSERT + RSC revalidation.
- Parade filters / week start: single upsert, fine.
- Search history: SELECT + upsert per record; fire-and-forget, not on a blocking path.

## 4. Workstreams

### WS1 — Parallelize and overlap the event write pipeline (highest value)

- Batch calendar-id resolution with `resolveGoogleCalendarIds` in create.
- Run per-copy Google writes with bounded concurrency (`mapSettled`, limit 4) for create,
  update and delete. All workers must **settle** before rollback so a failed create cannot
  orphan copies written by a sibling worker.
- Start the audit name lookups and the rendered title **before** the Google writes and
  await them after.
- Resolve `appBaseUrl()` once per action.
- Collapse the response-path tail into
  `Promise.all([logAction, invalidateGcalCache, invalidatePinnedCache])`.
- Fold `invalidateGcalCache`'s epoch bump + cache delete into one SQL statement (CTE).
- Keep cache invalidation **awaited before the action resolves** — the client's
  post-mutation `revalidate()` read must not race stale cache rows.

### WS2 — Trim the filter-save action

- Replace ownership SELECT + UPDATE with one `UPDATE … WHERE id AND user_id RETURNING`.
- Remove the redundant `revalidatePath("/dashboard")` from the filter save.

### WS3 — Registration probe

- Read all candidate targets concurrently (bounded) and pick the first copy in target
  order instead of scanning serially.

### WS4 — View CRUD and the remaining RSC revalidations

- Single-statement create/rename/delete; one batched reorder update.
- Remove `revalidatePath` from every tab CRUD action (the client re-reads its data).
- Remove the event actions' `revalidatePath("/dashboard")` once verified: the route is a
  thin shell and the dashboard's own `/api/dashboard/load` read follows the save.

### WS5 — Guardrails

- Unit-test the new `mapSettled` helper.
- Keep the mutation contract intact: `EventActionResult.copies` order stays target order,
  audit/webhook payload content unchanged, invalidation still completes before return.

## 5. Task list

### Phase 1 — Foundation

- [x] **T1** `src/lib/async.ts`: add `mapSettled(items, limit, fn)` returning
  `{ results, failures }`, running every item and collecting failures in item order.
  Tests in `src/lib/async.test.ts`.
- [x] **T2** `src/lib/google/eventsCache.ts`: fold `bumpCacheEpoch()` + cache DELETE into a
  single CTE statement inside `invalidateGcalCache`; keep the empty-input epoch bump.

### Phase 2 — Event write pipeline

- [x] **T3** `createEvent`: batch `resolveGoogleCalendarIds`, resolve `baseUrl` once,
  compute the title before writes, start name lookups before writes, bounded-concurrent
  creates with `mapSettled`, parallel post-write tail.
- [x] **T4** `performEventUpdate`: same baseUrl/title/names overlap, bounded-concurrent
  update/create/delete copies, aggregate copies/touched ids in target order, roll back
  only the copies created by this run.
- [x] **T5** `deleteEvent`: overlap name lookups, bounded-concurrent deletes, same tail.

### Phase 3 — Probe and filters

- [x] **T6** `findRepresentativeCopy`: bounded-concurrent target reads, first hit in
  target order.
- [x] **T7** `saveDashboardViewFilters`: single `UPDATE … RETURNING`.
- [x] **T8** Drop the redundant `revalidatePath("/dashboard")` from the filter save after
  an end-to-end check (dialog applies, grid refetches with the new filters).

### Phase 4 — Verification and docs

- [x] **T9** `pnpm lint`, `pnpm typecheck`, `pnpm test`; re-run the Google write probe to
  confirm the concurrent shape still holds after wiring.
- [x] **T10** Update `docs/event-mutations.md`, `docs/events-cache.md`,
  `docs/dashboard-views.md`, `progress.md` and `AGENTS.md` where the flow is described.
- [x] **T11** Bump `APP_VERSION` and hand the user the dev→prod commands.

### Phase 5 — View CRUD (round 2)

- [x] **T12** `renameDashboardView`: one `UPDATE … RETURNING`.
- [x] **T13** `deleteDashboardView`: one CTE with the ownership + last-view guard.
- [x] **T14** `reorderDashboardViews`: one batched `UPDATE … FROM (VALUES …)`.
- [x] **T15** `appendDashboardView`: drop the default-seed transaction + sort SELECT;
  cap probe + one INSERT with the next order in SQL.
- [x] **T16** Remove `revalidatePath` from every view action and from the event actions;
  verify read-your-writes through `/api/dashboard/load`.

## 6. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Concurrent Google writes hit quota / rate limits | Medium | Limit 4 (same as reads); writes per event are few; failures still roll back created copies. |
| A failed worker leaves a copy behind | High | `mapSettled` waits for **all** workers, then rolls back every returned copy; never throw before rollback. |
| Copy order in `EventActionResult.copies` / audit ids becomes nondeterministic | Low | Results are aligned to the target read order (slot-per-index), then flattened. |
| Cache invalidation races the client re-read | High (stale grid) | Invalidation stays awaited; the CTE keeps the epoch bump before the delete atomically. |
| `revalidatePath` removal has a hidden consumer | Medium | Removed only after verifying the client's `/api/dashboard/load` read sees create/delete immediately; KAH/pinned badges are client-refreshed on `cloudy2:events-changed`. |
| Batched reorder hits a unique constraint mid-statement | Low | The `(user_id, sort_order)` index is not unique; verified with a reversed-order round trip. |
| Dropping the default-tab seed on append changes first-tab behaviour | Low | The INSERT itself creates the first tab; `getDashboardViews` remains the only zero-tab seeder. |
| Two simultaneous appends can compute the same `sortOrder` (the old seed transaction serialized them) | Low | Ties order by `createdAt` and the next reorder normalizes the numbering; the client also guards its Add-view button. |
| Name lookup failure after writes causes a duplicate-on-retry | Low | Name promises have a `catch(() => null)`; the save succeeds with degraded audit names. |

## 7. Verification

- Before/after: run `.scratch/perf/probe-google-write.mjs`, `probe-db.mjs`,
  `probe-actions.mjs` and `probe-event-actions.mjs`.
- Functional: `pnpm lint`, `pnpm typecheck`, `pnpm test`; live checks: create a
  multi-department event (copies appear), edit, delete, self-register/deregister, apply
  filters, rename/delete/reorder a view, add a shared view.
- Contract: optimistic chip settles onto the returned copy ids; no duplicate copies after
  a failed create retry; no probe events or tabs left behind.

## 8. Round 1 outcome

Verified with the probes against dev Neon + dev Google, with the dev server running the
changed code.

| Metric | Before | After |
|---|---|---|
| `saveDashboardViewFilters` server-action round trip | 68 ms p50 / 102 p95 (2 DB statements + RSC revalidate) | **46–56 ms p50 / 48–53 p95** |
| Control action still doing SELECT + RSC revalidate | — | 89 ms p50 (removed legs ≈ 41 ms locally) |
| `GET /dashboard` RSC shell render | 66–78 ms p50 server-side | — |
| Create, 1 department | — | 1109–1155 ms end-to-end |
| Create, 3 departments | serial ≈ 3× | **1367–1520 ms (1.18–1.37×)** |
| `events.insert` ×3 isolated | 3593 ms serial | **1346 ms concurrent** |
| Update, 3-copy reconcile | — | 2066–2288 ms |
| Delete, 3 copies | — | 1998–2044 ms |
| Event-save response tail | 6 serial DB statements | names overlap writes; 1–2 effective statements |

Functional checks: create → update → delete on real dev Google with a sweep confirming
0 surviving probe events; filter save → dashboard load returned the new filter and the
original was restored; `pnpm vitest run` 136 files / 1765 tests pass; `pnpm lint` clean;
`pnpm typecheck` only the pre-existing Windows *EventFormSteps* casing error.

## 9. Round 2 outcome — view CRUD and the last RSC revalidation

| Action | Before | After |
|---|---|---|
| `renameDashboardView` | 92 ms p50 (owned SELECT + UPDATE + RSC) | **44–47 ms** (one `UPDATE … RETURNING`) |
| `reorderDashboardViews` (3 views) | 99 ms (SELECT + 3 UPDATEs in a transaction + RSC) | **62 ms** (one batched `UPDATE … FROM (VALUES …)`) |
| `createDashboardView` | 110–120 ms (default-seed transaction + count + sort SELECT + INSERT + RSC) | **51–67 ms** (cap probe + one INSERT) |
| `deleteDashboardView` | 93–103 ms (owned SELECT + COUNT + DELETE + RSC) | **41–57 ms** (one CTE) |
| `saveDashboardViewFilters` | 45–52 ms | unchanged |
| Event create/update/delete | + layout+page RSC render (~75 ms) per save | RSC leg removed; client re-read verified |

Correctness checks (live dev server, real dev Neon/Google):

- Reorder round-trip: reversed the strip, `/api/dashboard/load` returned the reversed
  order, original restored; deleting an unknown id returns "View not found";
  create+delete of a throwaway tab leaves the original 3 tabs.
- Event read-your-writes without `revalidatePath`: a current-month create is present in
  `/api/dashboard/load` immediately and absent after delete; the multi-department 2030
  create/update/delete probe still passes with 0 surviving copies.
- `pnpm test`, `pnpm lint` clean; `pnpm typecheck` only the pre-existing Windows casing
  error; no schema change.
