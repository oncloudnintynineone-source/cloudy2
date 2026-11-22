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
 *   vertical space as possible. The host sets `yOffset="16px"`, so Mantine
 *   centers inside a `100dvh - 32px` (2 × 16px gutter) box; subtracting the
 *   modal's own chrome (sticky header ~60px + body bottom padding ~16px =
 *   76px) gives `calc(100dvh - 32px - 76px)` = `calc(100dvh - 108px)`. That
 *   keeps the top/bottom gutters equal (~16px each) so the wizard uses nearly
 *   the whole phone screen.
 * - Desktop: the **same** `calc(100dvh - 108px)` is the honest ceiling — the
 *   host's `yOffset="16px"` leaves nothing else to give — so the body grows to
 *   `88dvh` (≈ 662px on a 770px laptop viewport, ≈ 827px at 1080p) and stops at
 *   a 900px cap, which keeps one step's fields from stretching across a very
 *   tall monitor. The previous `68dvh / 720px` pair left ~92px of that box
 *   unused on ordinary laptops, and its `calc(100dvh - 200px)` term never bound.
 */
export const WIZARD_BODY_HEIGHT_MOBILE = "calc(100dvh - 108px)";
export const WIZARD_BODY_HEIGHT_DESKTOP = "min(88dvh, 900px, calc(100dvh - 108px))";

/**
 * Event-form host modal widths in px. The modal's `size` prop and the
 * shrink-from-trigger animation (`modalContentWidth`, `src/lib/motion/origin.ts`)
 * must agree exactly or the dialog shrinks into the wrong place, so both read
 * this object. `wide` is a raw 720 rather than a Mantine token because
 * 720 = 0.9 × 800: at the lower edge of the wide band the modal's own `5vw`
 * inner padding clamps the content to exactly its requested width, so the
 * animation's `min(size, 90vw)` and the rendered width stay identical across the
 * whole ≥ 800px band (the `xl` token — 780px — would clamp to 736px there and
 * desync the shrink).
 */
export const WIZARD_MODAL_WIDTH_PX = {
  narrow: 320,
  mobile: 380,
  desktop: 440,
  wide: 720,
} as const;
