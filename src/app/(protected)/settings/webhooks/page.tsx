import { PageTransition } from "@/components/PageTransition";
import { listWebhooks } from "@/lib/webhooks/queries";
import { PayloadReference } from "./PayloadReference";
import { WebhookTable } from "./WebhookTable";

export default async function WebhooksPage() {
  const hooks = await listWebhooks();
  return (
    <PageTransition>
      <WebhookTable webhooks={hooks} />
      <PayloadReference />
    </PageTransition>
  );
}
