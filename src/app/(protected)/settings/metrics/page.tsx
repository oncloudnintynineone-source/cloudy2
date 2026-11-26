import { PageTransition } from "@/components/PageTransition";
import { getLedgerSummary } from "@/lib/metrics/queries";
import { getSettings } from "@/lib/settings/queries";
import { bytesToGiB, bytesToMiB, type MetricsFormValues } from "@/lib/metrics/validate";
import { MetricsView } from "./MetricsView";

export default async function MetricsPage() {
  const [summary, settings] = await Promise.all([getLedgerSummary(), getSettings()]);

  const initialConfig: MetricsFormValues = {
    enabled: settings.metricsEnabled,
    snapshotTime: settings.metricsSnapshotTime,
    snapshotDays: settings.metricsSnapshotDays,
    capComputeHours: settings.metricsNeonCapComputeHours,
    capEgressGiB: bytesToGiB(settings.metricsNeonCapEgressBytes),
    capStorageMiB: bytesToMiB(settings.metricsNeonCapStorageBytes),
    calibration: settings.metricsEgressCalibration,
    retentionDays: settings.metricsRetentionDays,
  };

  return (
    <PageTransition>
      <MetricsView summary={summary} initialConfig={initialConfig} />
    </PageTransition>
  );
}
