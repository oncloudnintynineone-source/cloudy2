import { PageTransition } from "@/components/PageTransition";
import { listQuickLinks } from "@/lib/quickLinks/queries";
import { QuickLinkTable } from "./QuickLinkTable";

export default async function QuickLinksPage() {
  const links = await listQuickLinks();
  return (
    <PageTransition>
      <QuickLinkTable links={links} />
    </PageTransition>
  );
}
