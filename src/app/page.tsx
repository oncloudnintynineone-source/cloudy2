import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { UI_STATE_COOKIE, decodeUiState, resolveLaunchTarget } from "@/lib/ui/uiState";

/**
 * The PWA start URL. On a cold open it lands the user back on their last
 * visited page (from the per-device remembered-state cookie) instead of always
 * on /dashboard. The target is whitelisted in resolveLaunchTarget; with no
 * session the protected layout redirects to /login as usual.
 */
export default async function Home() {
  const session = await getSession();
  const stored = decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value);
  redirect(resolveLaunchTarget(stored?.lastPage, session?.user.role ?? "user"));
}
