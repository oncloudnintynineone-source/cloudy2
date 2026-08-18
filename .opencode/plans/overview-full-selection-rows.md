# Overview: selecting all departments collapses to one (row scoping)

## 1. Problem

On the **Overview** tab, when a non-admin selects **all** departments in the
filter, the matrix shows only their **own** department. Selecting a subset of
departments works; selecting everything collapses to one.

### 1.1 Reproduction (live, dev DB, Bob = dev-CIU)

| Viewer | URL | Rendered departments |
|---|---|---|
| Bob | `/overview?cal=<CIU>,<COU>` (both) | **dev-CIU only** (2 users) — bug |
| Bob | `/overview?cal=<COU>` (one other) | dev-COU (6 users) — correct |
| Bob | `/dashboard?cal=<CIU>,<COU>` | both (8 users) — dashboard fine |

### 1.2 Root cause

`src/lib/overview/scope.ts` `overviewRowUserIds` uses a `narrowed` heuristic:

```ts
const narrowed =
  selectedCalendarIds.length > 0 && selectedCalendarIds.length < calendarCount;
const scoped = narrowed
  ? active.filter(u => u.department && selectedCalendarIds.includes(u.department.id))
  : isAdmin ? active : active.filter(u => u.department?.id === ownDepartmentId);
```

When a non-admin selects **all** calendars, `length < calendarCount` is false
→ `narrowed` is false → the **role default** applies → only the own department.
This is inconsistent with the dashboard's `scheduleUsers`
(`dashboard/page.tsx:98-105`), which always filters by `selectedCalendars` and
therefore shows every selected department.

The `narrowed` heuristic conflates two different states: "no filter"
(role default) and "filtered to everything". The `calendarCount`-comparison was
a proxy for "has an explicit filter", which is wrong for non-admins who
explicitly select all departments.

### 1.3 Non-bug check

- Admins are unaffected (role default = all active users incl. unassigned).
- The dashboard is unaffected (`scheduleUsers` has no fallback).

## 2. Fix

### 2.1 `src/lib/overview/scope.ts`

Replace the `narrowed` heuristic with a rule that treats a full selection as a
selection (dashboard parity), while preserving the admin "everything" default:

```ts
export function overviewRowUserIds(params: {
  users: readonly OverviewRowUser[];
  selectedCalendarIds: readonly string[];
  calendarCount: number;
  isAdmin: boolean;
}): string[] {
  const { users, selectedCalendarIds, calendarCount, isAdmin } = params;
  const active = users.filter((user) => user.status === "active");
  // Admin + every calendar selected (the default view, or an explicit full
  // selection) keeps the unassigned users visible; any other selection
  // narrows rows to the selected departments — same rule as the dashboard's
  // schedule rows.
  const showEverything = isAdmin && selectedCalendarIds.length === calendarCount;
  const scoped = showEverything
    ? active
    : active.filter(
        (user) => user.department !== null && selectedCalendarIds.includes(user.department.id),
      );
  return scoped.map((user) => user.id);
}
```

`ownDepartmentId` is dropped: the non-admin default already sets
`selectedCalendars = [ownDepartment]`, and `dept ∈ [own]` yields exactly the
own-department users (the old role default). The page keeps `ownDepartmentId`
for `defaultCalendars`. Doc comment updated.

Behavior matrix (unchanged cases):

| Case | Before | After |
|---|---|---|
| Non-admin default (own dept selected) | own dept | own dept (same) |
| Non-admin selects one other dept | that dept | that dept (same) |
| Non-admin selects **all** depts | **own dept (bug)** | **all selected depts** |
| Non-admin, no dept, no cal | none | none (same) |
| Admin default / selects all | all incl. unassigned | all incl. unassigned (same) |
| Admin selects subset | those depts | those depts (same) |

### 2.2 `src/app/(protected)/overview/page.tsx`

Remove the `ownDepartmentId` argument from the `overviewRowUserIds` call (the
variable stays — still used for `defaultCalendars`).

### 2.3 `src/lib/overview/scope.test.ts`

- Update all calls for the removed `ownDepartmentId` param.
- **New regression test:** non-admin selects ALL departments → returns the
  users of every selected department (both), not just the own one.
- **New test:** admin selects all departments explicitly → includes unassigned.
- Existing assertions (own dept default, other dept, users filter no-op,
  inactive excluded, unassigned-non-admin → []) stay and pass unchanged.

### 2.4 `progress.md`

- Status bullet (test count update).
- New section **1.39 Overview row scoping: full-selection fix** noting the
  `narrowed`-heuristic bug, the dashboard-parity rule, and that §1.37's
  description of the fallback is superseded.

## 3. Verification

1. `pnpm lint && pnpm typecheck && pnpm test` (currently 250 → +2) and
   `pnpm build`; `pnpm db:generate` (no schema change).
2. Live re-check (dev server, Bob session):
   - `/overview?cal=<CIU>,<COU>` → **both** departments (dev-CIU 2 + dev-COU 6).
   - `/overview?cal=<COU>` → dev-COU only (unchanged).
   - `/overview` default → dev-CIU only (unchanged).
   - Admin session (`/overview` default and explicit both) → unchanged, incl.
     unassigned group.
