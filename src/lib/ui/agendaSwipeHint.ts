/**
 * Session-scoped "seen" flag for the dashboard's agenda swipe hint. The flag
 * lives only in the browser's `sessionStorage` (never the database) so the
 * touch-only caption appears at most once per browser session. The mechanics
 * are the shared `createSessionHint` store (see sessionHint.ts).
 */

import { createSessionHint } from "./sessionHint";

export const AGENDA_SWIPE_HINT_STORAGE_KEY = "cloudy2.agenda-swipe-hint";

const hint = createSessionHint(AGENDA_SWIPE_HINT_STORAGE_KEY);

/** Live snapshot: whether the hint has been dismissed this session. */
export const getAgendaSwipeHintSnapshot = hint.getSnapshot;
/** Server snapshot: the hint is never dismissed before hydration. */
export const getAgendaSwipeHintServerSnapshot = hint.getServerSnapshot;
/** Subscribe to in-session writes (no cross-tab signal exists for this). */
export const subscribeAgendaSwipeHint = hint.subscribe;
/** Mark the hint seen for the rest of the session and notify subscribers. */
export const markAgendaSwipeHintSeen = hint.markSeen;
