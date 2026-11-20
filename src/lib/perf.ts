/**
 * Dev-only stage timing for the server read paths. Set `PERF_LOG=1` in the
 * environment to print one `[perf] <label>: <ms>` line per stage to the server
 * log; with the flag unset every `perf()` returns a no-op closer, so call
 * sites stay linear and cost nothing. Used by the My Events / calendar-cache
 * read paths (docs/event-history.md §1.4.2).
 */

const enabled = process.env.PERF_LOG === "1";

/**
 * Start a named stage; the returned closer logs its duration (and an optional
 * note, e.g. counts) when enabled. Never throws and never buffers.
 */
export function perf(label: string): (note?: string) => void {
  if (!enabled) {
    return () => {};
  }
  const start = performance.now();
  return (note?: string) => {
    const ms = (performance.now() - start).toFixed(1);
    console.info(`[perf] ${label}: ${ms}ms${note ? ` (${note})` : ""}`);
  };
}
