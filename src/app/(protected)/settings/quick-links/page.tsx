import { PageTransition } from "@/components/PageTransition";
import { listQuickLinks } from "@/lib/quickLinks/queries";
import { LOCKED_VARIANTS } from "@/lib/settings/featureFlags";
import { QuickLinkTable } from "./QuickLinkTable";

export default async function QuickLinksPage() {
  const links = await listQuickLinks();
  return (
    <PageTransition>
      <QuickLinkTable links={links} reorderDrag={LOCKED_VARIANTS.reorderDrag} />
    </PageTransition>
  );
}
