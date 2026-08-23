CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Carry the single-endpoint config (Phase 3ap) into the new table before its
-- settings columns are dropped; rows without a configured URL are skipped.
INSERT INTO "webhooks" ("id", "name", "url", "secret", "enabled", "created_at", "updated_at")
SELECT gen_random_uuid(), 'Migrated webhook', "webhook_url", "webhook_secret", "webhook_enabled", now(), now()
FROM "settings"
WHERE "webhook_url" IS NOT NULL AND "webhook_url" <> '';
--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "webhook_url";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "webhook_secret";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "webhook_enabled";