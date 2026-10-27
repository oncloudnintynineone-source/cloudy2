"use client";

import { useEffect, useState } from "react";

/**
 * Chunk readiness for lazily mounted modals/wizards.
 *
 * `next/dynamic` unmounts its fallback the instant the chunk resolves, so a
 * chunk skeleton hard-cuts into the real body. `useChunkReady` exposes the same
 * load as a boolean instead: keep the `dynamic` component (module-level, with
 * `loading: () => null`) and gate a `CrossfadeSwap` skeleton on the flag, so
 * the chunk reveal dissolves like every other skeleton → content swap. The
 * loader must be a stable module-level function — the same reference passed to
 * `dynamic()` — so this cache and webpack's module cache dedupe repeat opens,
 * idle preloads (`loadChunk`) and the dynamic component's own load.
 */

type ChunkLoader = () => Promise<unknown>;

interface ChunkEntry {
  promise: Promise<unknown>;
  ready: boolean;
}

const chunks = new WeakMap<ChunkLoader, ChunkEntry>();

/**
 * Start (or join) the chunk load behind `loader`. Resolves once the module has
 * arrived; a failed load is forgotten so the next open/preload retries. Safe
 * for fire-and-forget preloads.
 */
export function loadChunk(loader: ChunkLoader): Promise<unknown> {
  const existing = chunks.get(loader);
  if (existing) {
    return existing.promise;
  }
  const entry: ChunkEntry = { promise: Promise.resolve(), ready: false };
  entry.promise = loader().then(
    (value) => {
      entry.ready = true;
      return value;
    },
    (error: unknown) => {
      chunks.delete(loader);
      throw error;
    },
  );
  chunks.set(loader, entry);
  return entry.promise;
}

/** Whether `loader`'s chunk has already resolved. */
export function isChunkReady(loader: ChunkLoader): boolean {
  return chunks.get(loader)?.ready === true;
}

/**
 * True once `loader`'s chunk has resolved. The load starts when `enabled`
 * first turns true (the modal opening) — never at route mount, which is what
 * keeps these bodies out of the initial chunk. A failed load leaves this false
 * so the caller's skeleton stays up (same as the old `dynamic` fallback), and
 * the next open retries.
 */
export function useChunkReady(loader: ChunkLoader, enabled: boolean): boolean {
  const [ready, setReady] = useState(() => isChunkReady(loader));
  useEffect(() => {
    if (ready || !enabled) {
      return;
    }
    let alive = true;
    loadChunk(loader)
      .then(() => {
        if (alive) {
          setReady(true);
        }
      })
      .catch(() => {
        // The skeleton stays; the next open retries.
      });
    return () => {
      alive = false;
    };
  }, [ready, enabled, loader]);
  return ready;
}
