ALTER TABLE "event_types" ADD COLUMN "shortname" text;--> statement-breakpoint
CREATE UNIQUE INDEX "event_types_shortname_idx" ON "event_types" USING btree ("shortname");