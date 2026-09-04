import { getSettings } from "@/lib/settings/queries";
import { SecurityForm } from "./SecurityForm";

export default async function SecurityPage() {
  const settings = await getSettings();
  return <SecurityForm keyword={settings.userKeyword} />;
}
