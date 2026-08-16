import { requireAdmin } from "@/lib/session";
import { SettingsTabs } from "./SettingsTabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <SettingsTabs />
      {children}
    </div>
  );
}
