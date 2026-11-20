import { apiError, apiJson, withApiSession } from "@/lib/api/server";
import { checkUserClashes } from "@/lib/events/clashActions";

/**
 * The shell's Double Booking nav badge (the acting user's own scan). A plain
 * read route rather than a server action, so the badge refresh never queues
 * ahead of the user's next save or calendar read.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await withApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await checkUserClashes({});
    return apiJson(result);
  } catch {
    return apiError(500, "Could not check for double bookings");
  }
}
