/**
 * The wizard's fixed body height, shared by the real `EventForm` and its lazy
 * `next/dynamic` loading fallback so the modal never resizes while the form's
 * chunk downloads. Steps scroll inside this box, so the modal never resizes
 * between them and the Back/Next/Submit bar stays put. The size is a pure
 * function of the viewport (never of the active step's content): 100dvh shrinks
 * when the on-screen keyboard opens, so the cap follows. The host modal is
 * `centered` at every width, so the body height tiers on how the available
 * space is used (see docs/event-lifecycle.md §1.4):
 * - Mobile: the body **fills the centered modal's box**, taking up as much
 *   vertical space as possible. The host sets `yOffset="44px"`, so Mantine
 *   centers inside a `100dvh - 88px` (2 × 44px gutter) box; subtracting the
 *   modal's own chrome (sticky header ~60px + body bottom padding ~16px =
 *   76px) gives `calc(100dvh - 88px - 76px)` = `calc(100dvh - 164px)`. That
 *   keeps the top/bottom gutters equal (~44px each) and leaves room for the
 *   "Tap outside to minimize" caption at the bottom.
 * - Desktop: the centered modal's body grows with the viewport up to
 *   68dvh / 720px so a tall screen is actually used.
 */
export const WIZARD_BODY_HEIGHT_MOBILE = "calc(100dvh - 164px)";
export const WIZARD_BODY_HEIGHT_DESKTOP = "min(68dvh, 720px, calc(100dvh - 200px))";
