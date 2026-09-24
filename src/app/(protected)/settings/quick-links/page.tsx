import { PageTransition } from "@/components/PageTransition";
import { listQuickLinks } from "@/lib/quickLinks/queries";
import { isReorderDragEnabled } from "@/lib/settings/featureFlags";
import { getFeatureFlag } from "@/lib/settings/queries";
import { QuickLinkTable } from "./QuickLinkTable";

export default async function QuickLinksPage() {
  const [links, reorderDrag] = await Promise.all([listQuickLinks(), getFeatureFlag("reorderDrag")]);
  return (
    <PageTransition>
      <QuickLinkTable links={links} dragEnabled={isReorderDragEnabled(reorderDrag)} />
    </PageTransition>
  );
}
