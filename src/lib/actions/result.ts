/**
 * The app's one result shape for a server action: a success arm (optionally
 * carrying entity data) or a user-facing error whose optional `field` names the
 * form input to highlight.
 *
 * Exported action-specific names stay as aliases (e.g.
 * `QuickLinkActionResult`) so the ~36 client files importing them never change.
 * Kept free of I/O and framework code so it unit-tests without a database.
 */

/** A success arm, optionally extended with entity data. */
export type ActionOk<T extends object = Record<never, never>> = { ok: true } & T;

/** A failure arm. `F` is the closed set of field names the caller can map. */
export type ActionErr<F extends string = never> = {
  ok: false;
  error: string;
  field?: F;
};

export type ActionResult<
  T extends object = Record<never, never>,
  F extends string = never,
> = ActionOk<T> | ActionErr<F>;
