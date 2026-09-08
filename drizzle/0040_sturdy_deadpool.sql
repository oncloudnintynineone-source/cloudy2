ALTER TABLE "event_title_templates" ALTER COLUMN "template" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "event_title_templates" ADD COLUMN "recipe" jsonb DEFAULT '{"segments":[{"field":"description"}]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "event_title_recipe" jsonb DEFAULT '{"segments":[{"field":"description"}]}'::jsonb NOT NULL;--> statement-breakpoint
-- Structured-recipe switchover: existing free-text templates reset to defaults.
DELETE FROM "event_title_templates";--> statement-breakpoint
UPDATE "settings" SET "event_title_template_assignments" = '{}'::jsonb;