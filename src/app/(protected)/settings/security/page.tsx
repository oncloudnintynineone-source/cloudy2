import { PageTransition } from "@/components/PageTransition";
import { getSettings } from "@/lib/settings/queries";
import { SecurityForm } from "./SecurityForm";

export default async function SecurityPage() {
  const settings = await getSettings();
  return (
    <PageTransition>
      <SecurityForm keyword={settings.userKeyword} />
    </PageTransition>
  );
}
