import { NextResponse } from "next/server";

import { API_NO_STORE, apiSession, unauthorized } from "@/lib/api/server";
import { checkKahBreaches } from "@/lib/kah/statusActions";

/**
 * The shell's KAH Status nav badge. Route handler (not a server action) so it
 * never serializes against the user's own actions.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await apiSession();
  if (!session) {
    return unauthorized();
  }

  try {
    const result = await checkKahBreaches();
    return NextResponse.json(result, { headers: API_NO_STORE });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not check KAH breaches" },
      { status: 500, headers: API_NO_STORE },
    );
  }
}
