/**
 * Polite live-region announcement for skeleton loading states: skeletons are
 * visual-only, so screen readers get nothing without this. Include it once
 * beside every skeleton block (route `loading.tsx` files and client-side
 * view-switch skeletons). Server-safe — no client hooks.
 */
export function LoadingStatus({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="c2-sr-only">
      {label}…
    </div>
  );
}
