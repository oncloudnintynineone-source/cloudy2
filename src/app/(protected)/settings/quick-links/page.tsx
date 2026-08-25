import { listQuickLinks } from "@/lib/quickLinks/queries";
import { QuickLinkTable } from "./QuickLinkTable";

export default async function QuickLinksPage() {
  const links = await listQuickLinks();
  return <QuickLinkTable links={links} />;
}
