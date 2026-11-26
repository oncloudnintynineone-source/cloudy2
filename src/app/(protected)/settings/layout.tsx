import { getLedgerPillState } from "@/lib/metrics/queries";
import { requireAdmin } from "@/lib/session";
import { SettingsShell } from "./SettingsShell";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  // The ledger's warning state, so the Resource Usage tab can carry an amber
  // dot from any settings page. Cached for 60s
  // (`CONFIG_CACHE_KEYS.metricsLedger`) and failure-tolerant — a ledger that
  // cannot be read must never take the settings shell down with it.
  const pill = await getLedgerPillState();
  return <SettingsShell metricsWarning={pill.warn}>{children}</SettingsShell>;
}
