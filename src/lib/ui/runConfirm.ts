/**
 * The small async wrapper behind a `ConfirmModal`: run the call, then hand the
 * success/failure to the caller's toast + close logic. Kept separate from the
 * component so the branch is unit-testable.
 */

export type ConfirmCallResult = { ok: true } | { ok: false; error: string };

export interface RunConfirmOptions<TSuccess extends ConfirmCallResult> {
  call: () => Promise<TSuccess>;
  onSuccess: (result: Extract<TSuccess, { ok: true }>) => void;
  onError: (message: string) => void;
}

/** Returns true when the call succeeded. */
export async function runConfirm<TSuccess extends ConfirmCallResult>(
  options: RunConfirmOptions<TSuccess>,
): Promise<boolean> {
  const result = await options.call();
  if (result.ok) {
    options.onSuccess(result as Extract<TSuccess, { ok: true }>);
    return true;
  }
  options.onError(result.error);
  return false;
}
