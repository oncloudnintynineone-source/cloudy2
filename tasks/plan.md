# Implementation Plan: Recurring Events

## Overview

Add first-class recurring events to cloudy2. Events are written to Google Calendar in
Google's **native recurrence format** (`recurrence: ["RRULE:…"]`), so Google remains the
single source of truth and the read path (already `singleEvents: true`) keeps working.
In-app state (edit prefill, repeat summary, audit/webhooks) is carried by a new structured
`recurrence` key on the notes block, so the app never has to parse RRULEs to round-trip its
own events. Scope for v1: **series-wide edit/delete only** (editing any instance edits the
whole series) — no single-occurrence exceptions, no in-app cancel of one instance.

This plan deliberately avoids "deep architecture uproot": the cross-department copy model,
the notes block, the events cache, and the reconcile loop are all preserved. The invasive
bits are localized and called out in [Architecture decisions](#2-architecture-decisions).

## Table of Contents

- [1. Blast-radius assessment](#1-blast-radius-assessment)
- [2. Architecture decisions](#2-architecture-decisions)
- [3. Task list](#3-task-list)
- [4. Risks and mitigations](#4-risks-and-mitigations)
- [5. Open questions](#5-open-questions)

## 1. Blast-radius assessment

### 1.1 Contained (small, additive, pure)

| Touch point | File | Change |
|---|---|---|
| Google input contract | `src/lib/google/types.ts` | `GcalEventInput.recurrence?: string[]`; `GcalEventItem.recurringEventId?: string \| null`; `GoogleIntegration.getEvent(calendarId, id)` |
| Google write body | `src/lib/google/real.ts` `buildEventBody` (`:279`) | Pass `recurrence`; set `start/end.timeZone` for recurring timed events |
| Read mapping | `src/lib/google/real.ts` `mapGoogleEvent` (`:299`) | Surface `recurringEventId` |
| Cache codec | `src/lib/google/eventsCacheCodec.ts` | Persist `recurringEventId` (backward-compatible: decode tolerates absence) |
| Notes | `src/lib/events/notes.ts` | New `recurrence` key on `EventNotes` (round-trips for free via the existing JSON block) + `parseEventRecurrence()` reader |
| Form values + validation | `src/lib/events/validate.ts` | `EventFormValues` recurrence fields + pure validation |
| New pure module | `src/lib/events/recurrence.ts` | Recurrence config type, RRULE builder, UNTIL computation, label formatter — unit-tested |
| Read-side dedup | `src/lib/events/targets.ts` `dedupeEventsByGroupId` (`:75`) | Key becomes `(eventId, start)` instead of `eventId` — the single change that makes instances render |
| Audit/webhook | `src/lib/events/eventAudit.ts`, `src/lib/webhooks/payload.ts` | Add `recurrence` to the snapshot (flows through both) |

### 1.2 Genuinely invasive (moderate, localized)

- **Master-vs-instance awareness in edit/delete** — `src/lib/events/actions.ts`:
  - `EventRef` (`src/lib/events/targets.ts:13`) gains `recurringEventId?: string | null`.
  - `findCopies` (`actions.ts:369`) must return **only masters** (exclude items with
    `recurringEventId` set) and must resolve the series' first-occurrence window (via a new
    `getEvent` call) so the master is found even when the clicked instance is months after
    the series started — otherwise the reconcile loop would *create a duplicate orphan*.
  - `updateEvent` (`:556`) / `deleteEvent` (`:760`) retarget at masters; deleting a master
    deletes the whole series (Google semantics), so no per-instance cleanup needed.
- No DB schema change — there is no events table; notes and `google_event_cache.events`
  are free-form JSONB. No drizzle migration, no CI drift.

### 1.3 Explicitly out of scope (v1)

- Single-occurrence "this event only" edit/cancel (exception editing).
- Series-aware KAH evaluation (see [Risks](#4-risks-and-mitigations)).
- Recurrence-aware webhook payload beyond a `recurrence` field.
- Editing externally-created (Google-only) series beyond today's instance-id behavior.

## 2. Architecture decisions

### 2.1 Google-native RRULE, not app-side expansion

Write one master event per department calendar with a `recurrence` RRULE, exactly as Google
wants. The alternative (expanding client-side into N events) would break the "one copy per
logical event per department" invariant far harder and forfeit native series behavior
(exceptions, mobile clients, Google UI). `listEvents` already sends `singleEvents: true`
(`real.ts:250`), so instances arrive already expanded.

### 2.2 Dedup key becomes `(eventId, instance start)`

`dedupeEventsByGroupId` currently collapses every item sharing a notes `eventId`. With
recurrence, every instance of a series carries the same `eventId`, so this would collapse
the whole series into one event. Keying by `(eventId, start)`:
- single events behave exactly as today (copies across calendars share both),
- each series occurrence renders once (cross-calendar copies of one occurrence share both),
- distinct occurrences of the same series do not collide.

Legacy events (`eventId === null`) still pass through unchanged.

### 2.3 Series-wide edit/delete; instances resolve to their master

Clicking an instance produces a `CalendarEvent` whose payload carries the instance's
`recurringEventId` (the master's Google id). `updateEvent`/`deleteEvent` resolve the master
via a new `integration.getEvent`, derive the series start from it, and run the existing
reconcile loop over the series-start window with **masters-only** matching. Because all
department copies of a series start at the same instant, `findCopies` finds each
department's own master by notes `eventId` + masters-only filter. Result: the reconcile,
rollback, audit, webhook, and cache-invalidation machinery is unchanged — only what
`findCopies` targets is different. Single (non-recurring) events never set
`recurringEventId`, so their path is byte-for-byte the current behavior.

### 2.4 Structured recurrence lives in the notes; RRULE is derived

The notes block stores `recurrence: { freq, interval, weekdays?, until? }`. Edit prefill,
the repeat summary chip, and audit/webhook payloads read the structured config — no RRULE
parsing. A pure `buildRrule(config, allDay)` produces Google's string only at write time.
External events (no notes) simply show no repeat info and keep today's legacy edit path.

### 2.5 Fixed UTC+8 makes recurrence safe

The app is anchored to `Asia/Singapore` (no DST, `APP_TIMEZONE_OFFSET_MINUTES = 8 * 60`,
`datetime.ts:11`). Recurring timed events are written as `{ dateTime: "<local>", timeZone:
"Asia/Singapore" }` — per the Google API, the offset may be omitted when `timeZone` is set,
and `timeZone` is **required for recurring events**. Every occurrence stays at the same
wall-clock time deterministically. All-day recurring events use `date` (no timezone).
`UNTIL` is computed as the UTC instant of 23:59:59 UTC+8 for timed events and date-only for
all-day events.

## 3. Task list

### Phase 1: Pure foundation (no behavior change; everything unit-tested)

- [ ] **T1** `src/lib/events/recurrence.ts`: `EventRecurrence` type, `buildRrule()`, UNTIL
      computation, `formatRecurrence()` label. Tests in `recurrence.test.ts`.
- [ ] **T2** `EventFormValues` recurrence fields + `validateEventForm` recurrence rules
      (until-on-or-after-start; interval >= 1). Tests in `validate.test.ts`.
- [ ] **T3** `EventNotes.recurrence` + `parseEventRecurrence()` + encode round-trip. Tests
      in `notes.test.ts`.

### Phase 2: Google write/read plumbing

- [ ] **T4** `GcalEventInput.recurrence`; `buildEventBody` RRULE + `timeZone`; `mapGoogleEvent`
      captures `recurringEventId`; `getEvent` added to `GoogleIntegration` (real via
      `events.get`, stub returns `null`); codec persists `recurringEventId`. Update
      `eventsCacheCodec.test.ts`; manual verify of an all-day recurring insert in dev.
- [ ] **T5** Dedup key → `(eventId, start)` in `dedupeEventsByGroupId`; `CalendarEventPayload`
      gains `recurringEventId`; `mapCalendarItem` (`queries.ts:115`) wires it through.
      Update `targets.test.ts`; add a series-collapse regression test.
- [ ] **T6** `EventRef.recurringEventId` + pure instance→master resolution helper
      (master window from `getEvent`). Tests in `targets.test.ts`.
- [ ] **T7** `findCopies` masters-only + master-window; `buildGcalEventInput` writes
      recurrence + notes; `updateEvent`/`deleteEvent` retarget at masters. No unit tests
      (actions are I/O) — gate on typecheck + lint + manual dev check of
      create/edit/delete of a series.

### Phase 3: UI

- [ ] **T8** Repeat step in `EventForm.tsx`: presets (Does not repeat / Daily / Every
      weekday / Weekly / Monthly), interval stepper for weekly/monthly, "until" date +
      "Never ends". Prefill from `payload.recurrence`; review step shows the repeat label.
      Follow wizard conventions (badges/selects, no searchable dropdowns, mobile-first).
- [ ] **T9** "Repeats …" chip on recurring events in the calendar views (from notes; small).

### Phase 4: Downstream

- [ ] **T10** Add `recurrence` to audit snapshot + webhook payload (pure builders);
      update `eventAudit.test.ts` + `webhooks/payload.test.ts`.

### Phase 5: Docs, verification

- [ ] **T11** Update `docs/event-lifecycle.md` (remove the "No recurring events" non-goal,
      document series-wide v1 semantics + KAH limitation), `docs/events-cache.md`
      (dedup note), `docs/kah.md` (recurrence note), AGENTS.md architecture bullet, and
      `progress.md` changelog. (Plan docs follow the repo TOC/numbering conventions.)
- [ ] **T12** Full verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
      (CI order lint → typecheck → test → db:generate — no schema change expected, so the
      drift check should stay green).

### Checkpoints

- **After T1–T3:** `pnpm vitest run src/lib/events` passes; pure foundation is stable.
- **After T5:** a manually-created Google recurring series renders as individual instances
  in Month/Day/Week views (externally-created series already work today — regression guard).
- **After T7:** in-app create → instances visible; edit any instance → whole series
  updates; delete → whole series gone; single-event paths unchanged.
- **After T10:** audit rows and webhook payloads carry `recurrence`; no regressions.
- **After T12:** full CI pass; docs in sync.

## 4. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Reconcile loop creates an orphan duplicate if the master isn't found (instance months after series start) | High | T6/T7: resolve master window via `getEvent` before `findCopies`; error out cleanly if master is missing instead of creating |
| KAH breach check only evaluates the first occurrence's window for recurring events | Med | Documented limitation in v1 (`docs/kah.md`); series-aware evaluation (RRULE expansion server-side, new dep) is a follow-up |
| All-day recurring `timeZone` requirement ambiguity | Med | Verify in T4 against the real API (Google's own UI writes all-day series date-only); fall back to `timeZone: "Asia/Singapore"` if needed |
| Stale `google_event_cache` rows lack `recurringEventId` (no cache migration) | Low | Dedup uses `(eventId, start)` not `recurringEventId`, so old rows render correctly; missing field only degrades the edit resolution, and fresh rows (60 s) carry it |
| Editing an externally-created series via legacy instance-id path creates a Google exception | Low | Same behavior as today for external events; documented; not a regression |
| `dedupeEventsByGroupId` change regresses single-event rendering | Med | T5 adds a regression test; representative-copy selection is unchanged |
| Google's `events.update` on a master with changed start/end must not drop the recurrence | Med | T4/T7: recurrence is always re-written from the form; update is a full replace so RRULE + notes stay in lockstep |

## 5. Open questions

- Should "Every weekday" and custom weekdays (e.g. Tue+Thu) both be offered in v1, or just
  the presets listed in T8? (Presets-only keeps the UI small.)
- Is "Never ends" acceptable for v1, or must a repeating event always carry an end date?
  (Google allows an open-ended RRULE; ops teams often want a hard end.)
- Should the KAH check for recurring events be deferred entirely, or is a per-occurrence
  check within the first affected month acceptable scope for a later task?
- Webhook consumers: is a single `recurrence` field enough, or do they need the expanded
  occurrence list?
