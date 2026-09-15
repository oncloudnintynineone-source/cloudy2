import { PageTransition } from "@/components/PageTransition";
import { listWebhooks } from "@/lib/webhooks/queries";
import { WEBHOOK_ACTIONS } from "@/lib/webhooks/payload";
import { buildExampleWebhookPayload } from "@/lib/webhooks/example";
import { PayloadReference, type ExamplePayloads } from "./PayloadReference";
import { WebhookTable } from "./WebhookTable";

export default async function WebhooksPage() {
  const hooks = await listWebhooks();
  // Built here, on the server: the real builder reaches `notes.ts` (node:zlib),
  // which must not enter the client graph (see PayloadReference).
  const exampleJson: ExamplePayloads = {
    [WEBHOOK_ACTIONS.eventCreated]: buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventCreated),
    [WEBHOOK_ACTIONS.eventUpdated]: buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventUpdated),
    [WEBHOOK_ACTIONS.eventDeleted]: buildExampleWebhookPayload(WEBHOOK_ACTIONS.eventDeleted),
  };
  return (
    <PageTransition>
      <WebhookTable webhooks={hooks} />
      <PayloadReference exampleJson={exampleJson} />
    </PageTransition>
  );
}
