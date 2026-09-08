"use client";

import { type RefObject, useRef, useState } from "react";

import { useFlipReorder } from "@/lib/ui/flipReorder";

/**
 * Optimistic row reordering with FLIP animation — the shared code path behind
 * every manageable list in the app (title-recipe segments, dashboard views,
 * event-type groups, departments, quick links).
 *
 * A reorder is applied to the visible list instantly (snapshot -> reorder ->
 * `play()`), so the row slides exactly like the templates builder. When a
 * `persist` is provided the move is also written server-side: the optimistic
 * order is kept until a refresh returns rows already in that order (or the
 * membership changes), then the override is dropped and the authoritative rows
 * take over — never a visible snap-back. A failed write drops the override
 * immediately. Without `persist` the list is purely local and `onApply`
 * commits the new order to owner state.
 */

export interface UseReorderRowsOptions<Row> {
  /** Authoritative rows — owner state (local mode) or server props. */
  rows: readonly Row[];
  /** Stable key used for `data-flip-id` and order bookkeeping. */
  keyOf: (row: Row) => string;
  /** Pure: the list after moving `id` one step in `delta`'s direction, or
   *  null when the row can't move that way. */
  predict: (rows: readonly Row[], id: string, delta: 1 | -1) => readonly Row[] | null;
  /** Persist the move server-side; awaited before the next move is allowed.
   *  `next` is the full predicted order (whole-list backends like the
   *  dashboard views persist it directly; relative ones ignore it). */
  persist?: (
    next: readonly Row[],
    id: string,
    delta: 1 | -1,
  ) => Promise<boolean>;
  /** Local mode: commit the predicted order to the owner's state. */
  onApply?: (next: Row[]) => void;
}

export interface UseReorderRowsResult<Row> {
  /** Rows in display order — authoritative order, plus any optimistic override. */
  displayRows: readonly Row[];
  /** Attach to an ancestor of the `data-flip-container` lists. */
  containerRef: RefObject<HTMLDivElement | null>;
  snapshot: () => void;
  play: () => void;
  /** Optimistic (and, when server-backed, persisted) move. False when a write
   *  is already in flight or the row cannot move that way. */
  move: (id: string, delta: 1 | -1) => Promise<boolean>;
  /** True while a server write is in flight. */
  busy: boolean;
}

/** True when both arrays hold the same keys in the same order. */
export function keysEqualOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** True when both arrays hold the same keys, regardless of order. */
export function sameKeyMembership(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((key, index) => key === sortedB[index]);
}

/** An optimistic override is stale (drop it) once the authoritative rows
 *  already match its order or no longer share its membership. */
export function overrideIsStale(override: readonly string[], currentKeys: readonly string[]): boolean {
  return keysEqualOrder(override, currentKeys) || !sameKeyMembership(override, currentKeys);
}

/** Plain adjacent swap for flat, fully-ordered lists (dashboard views, quick
 *  links, title-recipe segments). */
export function swapAdjacent<Row>(
  rows: readonly Row[],
  keyOf: (row: Row) => string,
  id: string,
  delta: 1 | -1,
): Row[] | null {
  const index = rows.findIndex((row) => keyOf(row) === id);
  if (index === -1) {
    return null;
  }
  const target = index + delta;
  if (target < 0 || target >= rows.length) {
    return null;
  }
  const next = [...rows];
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row);
  return next;
}

export function useReorderRows<Row>({
  rows,
  keyOf,
  predict,
  persist,
  onApply,
}: UseReorderRowsOptions<Row>): UseReorderRowsResult<Row> {
  const serverBacked = persist !== undefined;
  const { containerRef, snapshot, play } = useFlipReorder();
  const [override, setOverride] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const currentKeys = rows.map(keyOf);

  // Render-phase reconcile (guarded — never an effect): drop the optimistic
  // override as soon as the authoritative rows catch up with it or change
  // membership, so displayRows tracks the server without ever snapping back.
  let resolvedOverride: string[] | null = override;
  if (override !== null && overrideIsStale(override, currentKeys)) {
    resolvedOverride = null;
    setOverride(null);
  }

  const displayRows: readonly Row[] = (() => {
    if (!serverBacked || resolvedOverride === null) {
      return rows;
    }
    const byKey = new Map(rows.map((row) => [keyOf(row), row] as const));
    const visible = resolvedOverride
      .map((id) => byKey.get(id))
      .filter((row): row is Row => row !== undefined);
    return visible.length === resolvedOverride.length ? visible : rows;
  })();

  const move = async (id: string, delta: 1 | -1): Promise<boolean> => {
    if (busy || busyRef.current) {
      return false;
    }
    const source = serverBacked ? displayRows : rows;
    const predicted = predict(source, id, delta);
    if (!predicted) {
      return false;
    }
    snapshot();
    if (serverBacked) {
      setOverride(predicted.map((row) => keyOf(row)));
    } else {
      onApply?.([...predicted]);
    }
    requestAnimationFrame(() => requestAnimationFrame(play));
    if (!serverBacked) {
      return true;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const ok = await persist!(predicted, id, delta);
      if (!ok) {
        setOverride(null);
      }
      return ok;
    } catch {
      setOverride(null);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return { displayRows, containerRef, snapshot, play, move, busy };
}
