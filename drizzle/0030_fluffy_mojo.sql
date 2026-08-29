ALTER TABLE "calendars" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_parent_id_calendars_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."calendars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendars_parent_idx" ON "calendars" USING btree ("parent_id");