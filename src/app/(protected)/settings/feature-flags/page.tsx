import { PageTransition } from "@/components/PageTransition";
import { getSettings } from "@/lib/settings/queries";
import { FeatureFlagsForm } from "./FeatureFlagsForm";

export default async function FeatureFlagsPage() {
  const settings = await getSettings();
  return (
    <PageTransition>
      <FeatureFlagsForm initialValues={settings.featureFlags} />
    </PageTransition>
  );
}