CREATE TABLE "google_event_cache" (
	"calendar_google_id" text NOT NULL,
	"month" text NOT NULL,
	"events" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "google_event_cache_calendar_google_id_month_pk" PRIMARY KEY("calendar_google_id","month")
);
