import { apiJson, withApiSession } from "@/lib/api/server";
import { maybeDispatchParadeEmail } from "@/lib/parade-email/actions";

/**
 * Lazy in-app trigger for the daily parade-state email (docs/parade-state-email.md).
 * Route handler so the opportunistic tick never waits behind (or blocks) a user
 * action. The send itself is idempotent and runs inside `after()`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await withApiSession(request, { requireApiHeader: true });
  if (!auth.ok) {
    return auth.response;
  }

  await maybeDispatchParadeEmail();
  return apiJson({ ok: true });
}
