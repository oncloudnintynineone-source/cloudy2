import { dashboardBootSignature } from "@/lib/dashboard/prefetch";

export const DASHBOARD_BOOT_MAX_AGE_MS = 15_000;

export interface DashboardBootPayload {
  userId: string;
  view: string | null;
  month: string | null;
  date: string | null;
  refresh: string | null;
}

export interface DashboardBootResponse {
  status: number;
  data: unknown;
}

export interface DashboardBootState extends DashboardBootPayload {
  startedAt: number;
  promise: Promise<DashboardBootResponse | null>;
  abort: () => void;
}

export function serializeDashboardBootPayload(payload: DashboardBootPayload): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function readDashboardBootState(value: unknown): DashboardBootState | null {
  if (!isRecord(value)) return null;
  if (typeof value.userId !== "string") return null;
  if (typeof value.startedAt !== "number") return null;
  if (typeof value.abort !== "function") return null;
  if (!(value.promise instanceof Promise)) return null;
  return {
    userId: value.userId,
    view: stringOrNull(value.view),
    month: stringOrNull(value.month),
    date: stringOrNull(value.date),
    refresh: stringOrNull(value.refresh),
    startedAt: value.startedAt,
    promise: value.promise as Promise<DashboardBootResponse | null>,
    abort: value.abort as () => void,
  };
}

export function takeDashboardBoot(
  userId: string,
  signature: string,
  now: number,
): DashboardBootState | null {
  if (typeof window === "undefined") return null;
  const raw = (window as unknown as Record<string, unknown>).__C2_DASH_BOOT__;
  const boot = readDashboardBootState(raw);
  delete (window as unknown as Record<string, unknown>).__C2_DASH_BOOT__;
  if (!boot) return null;
  if (boot.userId !== userId) {
    boot.abort();
    return null;
  }
  if (now - boot.startedAt > DASHBOARD_BOOT_MAX_AGE_MS) {
    boot.abort();
    return null;
  }
  const bootSignature = dashboardBootSignature({
    view: boot.view,
    month: boot.month,
    date: boot.date,
    refresh: boot.refresh,
  });
  if (bootSignature !== signature) {
    boot.abort();
    return null;
  }
  return boot;
}
