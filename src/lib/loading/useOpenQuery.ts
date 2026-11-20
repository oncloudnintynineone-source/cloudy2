"use client";

import { useCallback, useEffect, useState } from "react";

export type OpenQueryStatus = "idle" | "loading" | "ready" | "error";

export interface OpenQueryState<T> {
  status: OpenQueryStatus;
  data: T | null;
  error: string | null;
  /** Monotonic request id; the latest request wins. */
  requestId: number;
}

export type OpenQueryAction<T> =
  | { type: "reset"; keepData?: boolean; enabled?: boolean }
  | { type: "start"; keepData?: boolean }
  | { type: "success"; requestId: number; data: T }
  | { type: "error"; requestId: number; error: string };

/**
 * Pure state machine behind {@link useOpenQuery}: reset on open/key change,
 * monotonic request ids so a stale response is ignored, and a terminal
 * ready/error state (never a permanent spinner).
 */
export function openQueryReducer<T>(
  state: OpenQueryState<T>,
  action: OpenQueryAction<T>,
): OpenQueryState<T> {
  switch (action.type) {
    case "reset":
      return {
        status: action.enabled === false ? "idle" : "loading",
        data: action.keepData ? state.data : null,
        error: null,
        requestId: state.requestId + 1,
      };
    case "start":
      return {
        status: "loading",
        data: action.keepData ? state.data : null,
        error: null,
        requestId: state.requestId + 1,
      };
    case "success":
      if (action.requestId !== state.requestId) {
        return state;
      }
      return { status: "ready", data: action.data, error: null, requestId: state.requestId };
    case "error":
      if (action.requestId !== state.requestId) {
        return state;
      }
      return {
        status: "error",
        data: state.data,
        error: action.error,
        requestId: state.requestId,
      };
  }
}

export interface UseOpenQueryOptions<T> {
  enabled: boolean;
  /** Changing this resets the query (e.g. the selected event id). */
  key?: string | number | null;
  /** Must be stable: a server action reference or a `useCallback`. */
  load: () => Promise<T>;
  /** Must be stable: a module-level function or a `useCallback`. */
  mapError: (error: unknown) => string;
  initialData?: T | null;
  /** Keep the last data through a close/reopen (see EventHistory). */
  keepData?: boolean;
}

/**
 * Load-on-open state for a dialog body. Returns idle before the first open,
 * loading while the request is in flight, then ready or a terminal error with
 * `reload` for the retry button.
 */
export function useOpenQuery<T>({
  enabled,
  key,
  load,
  mapError,
  initialData = null,
  keepData = false,
}: UseOpenQueryOptions<T>): {
  status: OpenQueryStatus;
  data: T | null;
  error: string | null;
  reload: () => void;
  /** Replace the data after an optimistic mutation (keeps the query ready). */
  setData: (data: T) => void;
} {
  const [state, setState] = useState<OpenQueryState<T>>({
    status: enabled ? "loading" : "idle",
    data: initialData,
    error: null,
    requestId: 0,
  });
  // Render-phase reset when the open/key context changes (the repo's guarded
  // setState-during-render recipe, not a ref).
  const [lastContext, setLastContext] = useState({ enabled, key });
  if (lastContext.enabled !== enabled || lastContext.key !== key) {
    setLastContext({ enabled, key });
    setState((current) => openQueryReducer(current, { type: "reset", keepData, enabled }));
  }

  const reload = useCallback(() => {
    setState((current) => openQueryReducer(current, { type: "start", keepData }));
  }, [keepData]);

  const setData = useCallback((data: T) => {
    setState((current) => ({ ...current, status: "ready", data, error: null }));
  }, []);

  useEffect(() => {
    if (!enabled || state.status !== "loading") {
      return;
    }
    const requestId = state.requestId;
    let alive = true;
    load()
      .then((data) => {
        if (alive) {
          setState((current) => openQueryReducer(current, { type: "success", requestId, data }));
        }
      })
      .catch((error: unknown) => {
        if (alive) {
          setState((current) =>
            openQueryReducer(current, {
              type: "error",
              requestId,
              error: mapError(error),
            }),
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [enabled, state.status, state.requestId, load, mapError]);

  return { status: state.status, data: state.data, error: state.error, reload, setData };
}
