import { apiError, apiJson, withApiSession } from "@/lib/api/server";
import { checkKahBreaches } from "@/lib/kah/statusActions";

/**
 * The shell's KAH Status nav badge. Route handler (not a server action) so it
 * never serializes against the user's own actions.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await withApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await checkKahBreaches();
    return apiJson(result);
  } catch {
    return apiError(500, "Could not check KAH breaches");
  }
}
