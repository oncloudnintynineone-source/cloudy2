import { getSettings } from "@/lib/settings/queries";
import { SettingsForm } from "./SettingsForm";

export default async function GeneralPage() {
  const settings = await getSettings();
  return <SettingsForm keyword={settings.userKeyword} retentionDays={settings.auditLogRetentionDays} />;
}
