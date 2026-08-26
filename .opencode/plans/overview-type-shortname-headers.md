# Overview: show event-type shortnames in matrix column headers

## 1. Goal

On the **Overview** page, the matrix column headers currently show the full
event-type name (e.g. "Local Leave", "Overseas Leave", "Meeting"). Show the
type's **shortname** acronym (e.g. "LL", "OL", "M") instead, with the full name
available as a tooltip.

Scope (user-confirmed: **headers only**):
- Matrix column headers → shortname, `title` tooltip = full name.
- Filter dialog **Event Types** group keeps full names (identifiability).
- URL `?types=` values and the counts object keys **stay full names** — the
  server's `parseEventType`/`typeFilter` read full names from event notes, so
  the value layer is untouched.

## 2. Changes

### 2.1 `src/app/(protected)/overview/page.tsx`

Build a name → shortname map from `listEventTypes()` and pass it down:

```ts
const typeShortnames = Object.fromEntries(
  eventTypes.map((type) => [type.name, type.shortname ?? type.name]),
);
```

Pass `typeShortnames={typeShortnames}` to `OverviewView`. No other page logic
changes (`typeNames`, `displayedTypeNames`, `selectedTypes`, `counts` all keep
working with full names).

### 2.2 `src/app/(protected)/overview/OverviewView.tsx`

- Add prop `typeShortnames: Record<string, string>`.
- Column header cell (currently `OverviewView.tsx:249-276`): render
  `typeShortnames[name] ?? name` as the header text; keep `title={name}` (full
  name tooltip) and `key={name}`. Count cells and `gridTemplateColumns` are
  unchanged (still driven by full-name `typeNames`).
- Column width stays `TYPE_COL_WIDTH = 80` — safe for acronyms without clipping
  the shortnames that equal the full name (e.g. "Duty", "Others").

### 2.3 `progress.md`

Short status bullet under 1.1 noting the Overview matrix headers now render the
event-type shortname (tooltip = full name); filter and URL params unchanged.

## 3. Non-changes / rationale

- Dashboard untouched (its schedule view has no per-type columns; its filter
  dialog is out of scope per the user's choice).
- No pure-logic change → no new unit tests; existing 251 tests unaffected.

## 4. Verification

1. `pnpm lint && pnpm typecheck && pnpm test` (251) and `pnpm build`.
2. Live re-check on the dev server (Bob session):
   - `/overview` (default) and `?types=...` → headers render shortnames
     ("LL", "OL", "M", "Duty", "Others"), `title` attributes hold the full
     names, counts per column match the full-name columns.
   - Filter dialog's Event Types chips still show full names; applying a type
     filter still narrows columns and counts.
