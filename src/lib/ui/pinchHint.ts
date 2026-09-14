/**
 * Session-scoped "seen" flag for the dashboard's pinch-to-zoom hint — the
 * touch-only caption shown once beside the zoom buttons. Same contract as the
 * agenda swipe hint: the flag lives only in the browser's `sessionStorage`
 * (never the database), so it appears at most once per browser session and
 * again on the next cold run. Mechanics: the shared `createSessionHint` store
 * (see sessionHint.ts).
 */

import { createSessionHint } from "./sessionHint";

export const PINCH_HINT_STORAGE_KEY = "cloudy2.pinch-hint";

const hint = createSessionHint(PINCH_HINT_STORAGE_KEY);

/** Live snapshot: whether the hint has been dismissed this session. */
export const getPinchHintSnapshot = hint.getSnapshot;
/** Server snapshot: the hint is never dismissed before hydration. */
export const getPinchHintServerSnapshot = hint.getServerSnapshot;
/** Subscribe to in-session writes (no cross-tab signal exists for this). */
export const subscribePinchHint = hint.subscribe;
/** Mark the hint seen for the rest of the session and notify subscribers. */
export const markPinchHintSeen = hint.markSeen;
