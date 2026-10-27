import { NextResponse } from "next/server";

import { API_NO_STORE, apiSession, unauthorized } from "@/lib/api/server";
import { checkUserClashes } from "@/lib/events/clashActions";

/**
 * The shell's Double Booking nav badge (the acting user's own scan). A plain
 * read route rather than a server action, so the badge refresh never queues
 * ahead of the user's next save or calendar read.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await apiSession();
  if (!session) {
    return unauthorized();
  }

  try {
    const result = await checkUserClashes({});
    return NextResponse.json(result, { headers: API_NO_STORE });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not check for double bookings" },
      { status: 500, headers: API_NO_STORE },
    );
  }
}
