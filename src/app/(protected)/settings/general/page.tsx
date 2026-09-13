import { PageTransition } from "@/components/PageTransition";
import { getSettings } from "@/lib/settings/queries";
import { SettingsForm } from "./SettingsForm";

export default async function GeneralPage() {
  const settings = await getSettings();
  return (
    <PageTransition>
      <SettingsForm retentionDays={settings.auditLogRetentionDays} />
    </PageTransition>
  );
}
