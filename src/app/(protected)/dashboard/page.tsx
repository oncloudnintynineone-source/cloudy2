import { Suspense } from "react";
import { cookies } from "next/headers";

import { PageTransition } from "@/components/PageTransition";
import { clampMonthZoom } from "@/lib/ui/monthZoom";
import { GRID_WEEK_COL_ZOOM_DEFAULT, clampGridWeekColZoom, clampZoom } from "@/lib/ui/slotZoom";
import { DUAL_SPLIT_DEFAULT, clampDualSplit } from "@/lib/ui/dualSplit";
import { UI_STATE_COOKIE, decodeUiState } from "@/lib/ui/uiState";
import { requireSession } from "@/lib/session";
import { serializeDashboardBootPayload } from "@/lib/dashboard/boot";
import { DashboardScreen } from "./DashboardScreen";
import DashboardLoading from "./loading";

/** Same month shape the server's `resolvePeriod` accepts. */
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : null;
}

function bootScript(payload: string): string {
  return `(function(){try{if(document.readyState!=="loading")return;try{performance.mark("c2:dashboard:boot-start")}catch(e){}var p=${payload};var c=new AbortController();var f=fetch("/api/dashboard/load",{method:"POST",headers:{"content-type":"application/json","x-cloudy2-api":"1"},credentials:"same-origin",body:JSON.stringify({view:p.view,month:p.month,date:p.date,refresh:p.refresh}),signal:c.signal});var q=f.then(function(r){return r.json().then(function(d){return {status:r.status,data:d}},function(){return {status:r.status,data:null}})}).catch(function(){return null});window.__C2_DASH_BOOT__={userId:p.userId,view:p.view,month:p.month,date:p.date,refresh:p.refresh,startedAt:Date.now(),promise:q,abort:function(){try{c.abort()}catch(e){}}};setTimeout(function(){var b=window.__C2_DASH_BOOT__;if(b&&b.promise===q){try{c.abort()}catch(e){};window.__C2_DASH_BOOT__=null}},60000)}catch(e){}})();`;
}

/**
 * The Calendar route is a thin server shell (docs/pwa-offline.md). It resolves
 * only the session and the device-local zoom state, then hands off to the
 * client `DashboardScreen`, which paints the last on-device snapshot instantly
 * and revalidates via the `/api/dashboard/load` route handler. All the heavy
 * reads (tabs, filters, calendars, users, settings, events) moved into that
 * read so the route no longer blocks first paint.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, params] = await Promise.all([requireSession(), searchParams]);
  // Per-device zoom state is read from the client-owned `cloudy2.ui` cookie
  // before first paint so a cold open restores the last zoom with no width jump.
  const nav = decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value)?.dashboard;
  const initialZoom = clampZoom(nav?.zoom) ?? 1;
  // Week (Grid) columns default to 2× fit (GRID_WEEK_COL_ZOOM_DEFAULT), not the
  // fit level: a fresh device opens the grid zoomed in and panning.
  const initialGridWeekColZoom =
    clampGridWeekColZoom(nav?.gridWeekColZoom) ?? GRID_WEEK_COL_ZOOM_DEFAULT;
  const initialGridWeekRowZoom = clampZoom(nav?.gridWeekRowZoom) ?? 1;
  // Week (D) day-column zoom — single-axis, floored at fit (1).
  const initialWeekMatrixZoom = clampGridWeekColZoom(nav?.weekMatrixZoom) ?? 1;
  const initialMonthZoom = clampMonthZoom(nav?.monthZoom) ?? 1;
  // Dual Pane split ratio (Month pane fraction) — same device-local contract.
  const initialDualSplit = clampDualSplit(nav?.dualSplit) ?? DUAL_SPLIT_DEFAULT;
  // The remembered anchor month (validated like the server's `resolvePeriod`)
  // tells the client which cached context to paint on a cold open, so the
  // preload's future-month anchors never become the landing view.
  const initialMonth =
    typeof nav?.month === "string" && MONTH_PATTERN.test(nav.month) ? nav.month : null;
  const bootPayload = serializeDashboardBootPayload({
    userId: session.user.id,
    view: firstParam(params.view),
    month: firstParam(params.month),
    date: firstParam(params.date),
    refresh: firstParam(params.refresh),
  });

  return (
    <>
      <script
        id="c2-dashboard-boot"
        dangerouslySetInnerHTML={{ __html: bootScript(bootPayload) }}
      />
      <PageTransition>
        <Suspense fallback={<DashboardLoading />}>
          <DashboardScreen
            userId={session.user.id}
            initialZoom={initialZoom}
            initialGridWeekColZoom={initialGridWeekColZoom}
            initialGridWeekRowZoom={initialGridWeekRowZoom}
            initialWeekMatrixZoom={initialWeekMatrixZoom}
            initialMonthZoom={initialMonthZoom}
            initialDualSplit={initialDualSplit}
            initialMonth={initialMonth}
          />
        </Suspense>
      </PageTransition>
    </>
  );
}
