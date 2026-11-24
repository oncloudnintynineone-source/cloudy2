CREATE TABLE "google_event_cache_creators" (
	"calendar_google_id" text NOT NULL,
	"month" text NOT NULL,
	"creator_id" uuid NOT NULL,
	CONSTRAINT "google_event_cache_creators_calendar_google_id_month_creator_id_pk" PRIMARY KEY("calendar_google_id","month","creator_id")
);
--> statement-breakpoint
ALTER TABLE "google_event_cache" ALTER COLUMN "events" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pinned_event_cache" ALTER COLUMN "events" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "google_event_cache" ADD COLUMN "payload" text;--> statement-breakpoint
ALTER TABLE "google_event_cache" ADD COLUMN "creator_indexed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pinned_event_cache" ADD COLUMN "payload" text;--> statement-breakpoint
CREATE INDEX "gcal_cache_creators_creator_idx" ON "google_event_cache_creators" USING btree ("creator_id");