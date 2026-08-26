ALTER TABLE "settings" ADD COLUMN "webhook_url" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "webhook_enabled" boolean DEFAULT false NOT NULL;