# Task List: Recurring Events

> Companion to `tasks/plan.md`. Order matters; each task leaves the system green.

## Phase 1 — Pure foundation

- [ ] T1: `src/lib/events/recurrence.ts` — `EventRecurrence` type, `buildRrule()`, UNTIL computation, `formatRecurrence()`. Tests in `recurrence.test.ts`.
- [ ] T2: `EventFormValues` recurrence fields + `validateEventForm` rules. Tests in `validate.test.ts`.
- [ ] T3: `EventNotes.recurrence` + `parseEventRecurrence()` + encode round-trip. Tests in `notes.test.ts`.

**Checkpoint:** `pnpm vitest run src/lib/events` green.

## Phase 2 — Google write/read plumbing

- [ ] T4: `GcalEventInput.recurrence`; `buildEventBody` RRULE + `timeZone`; `mapGoogleEvent` → `recurringEventId`; `getEvent` on `GoogleIntegration` (real + stub); codec persists `recurringEventId`. Update `eventsCacheCodec.test.ts`; manual all-day-recurring dev check.
- [ ] T5: Dedup key → `(eventId, start)`; `CalendarEventPayload.recurringEventId`; wire through `mapCalendarItem`. Update `targets.test.ts` + series-collapse regression test.
- [ ] T6: `EventRef.recurringEventId` + pure instance→master resolution helper. Tests in `targets.test.ts`.
- [ ] T7: `findCopies` masters-only + master-window; `buildGcalEventInput` writes recurrence + notes; `updateEvent`/`deleteEvent` retarget at masters. Gate on typecheck/lint + manual dev check.

**Checkpoint:** in-app create/edit/delete of a series works; single-event paths unchanged.

## Phase 3 — UI

- [ ] T8: Repeat step in `EventForm.tsx` (presets, interval, until/Never, prefill, review label).
- [ ] T9: "Repeats …" chip on recurring events in calendar views.

## Phase 4 — Downstream

- [ ] T10: `recurrence` in audit snapshot + webhook payload. Update `eventAudit.test.ts` + `webhooks/payload.test.ts`.

## Phase 5 — Docs + verification

- [ ] T11: Update `docs/event-lifecycle.md`, `docs/events-cache.md`, `docs/kah.md`, AGENTS.md, `progress.md`.
- [ ] T12: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (CI order), `pnpm db:generate` drift check (no schema change expected).

**Checkpoint:** full CI pass; docs in sync.
