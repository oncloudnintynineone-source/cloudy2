import { requireAdmin } from "@/lib/session";
import { SettingsTabs } from "./SettingsTabs";
import { SETTINGS_TAB_BAR_OFFSET } from "./settingsTabBar";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div style={{ paddingBottom: SETTINGS_TAB_BAR_OFFSET }}>
      <SettingsTabs />
      {children}
    </div>
  );
}
