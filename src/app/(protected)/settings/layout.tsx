import { requireAdmin } from "@/lib/session";
import { SettingsShell } from "./SettingsShell";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <SettingsShell>{children}</SettingsShell>;
}
