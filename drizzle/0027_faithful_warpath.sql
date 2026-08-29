ALTER TABLE "event_types" ADD COLUMN "allowed_locations" text[] DEFAULT '{in,out,overseas}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "show_remarks" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "event_types" SET "allowed_locations" = CASE
  WHEN "location_policy" = 'in' THEN ARRAY['in']
  WHEN "location_policy" = 'out' THEN ARRAY['out','overseas']
  ELSE ARRAY['in','out','overseas']
END;