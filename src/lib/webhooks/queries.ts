import { asc } from "drizzle-orm";

import { db } from "@/db";
import { webhooks, type Webhook } from "@/db/schema";

/** All registered webhook endpoints in stable display/delivery order. */
export async function listWebhooks(): Promise<Webhook[]> {
  return db
    .select()
    .from(webhooks)
    .orderBy(asc(webhooks.createdAt), asc(webhooks.name));
}
