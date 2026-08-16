ALTER TABLE "settings" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "id" SET DEFAULT 'singleton';--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 'singleton');