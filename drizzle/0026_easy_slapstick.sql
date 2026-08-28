ALTER TABLE "calendars" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "calendars_sort_idx" ON "calendars" USING btree ("sort_order");