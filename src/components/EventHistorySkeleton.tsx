import { Skeleton } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

/**
 * Shaped skeleton for the per-event history list (the shared history modal):
 * the same rail the entries paint into — bullet, connector, three lines per
 * change — so the swap in place moves nothing. Server-safe (no hooks) so any
 * surface can paint it while the audit rows load (skeleton-only loading rule).
 */
export function EventHistorySkeleton() {
  return (
    <div>
      <LoadingStatus label="Loading event history" />
      <Skeleton height={16} width="45%" radius="sm" mb="lg" />
      <ol className="c2-hist">
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index} className="c2-hist-item">
            <span className="c2-hist-bullet" aria-hidden />
            <div className="c2-hist-body">
              <Skeleton height={18} width="55%" radius="sm" />
              <Skeleton height={14} width="70%" radius="sm" mt={6} />
              <Skeleton height={14} width="38%" radius="sm" mt={10} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
