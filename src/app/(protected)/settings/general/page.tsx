import { getSettings } from "@/lib/settings/queries";
import { listUsers } from "@/lib/roster/queries";
import { SettingsForm } from "./SettingsForm";

export default async function GeneralPage() {
  const [settings, users] = await Promise.all([getSettings(), listUsers()]);
  const previewUsers = users.slice(0, 5).map((user) => ({
    name: user.name,
    departmentName: user.department?.name ?? null,
  }));
  return (
    <SettingsForm
      keyword={settings.userKeyword}
      nameTemplate={settings.nameTemplate}
      previewUsers={previewUsers}
    />
  );
}
