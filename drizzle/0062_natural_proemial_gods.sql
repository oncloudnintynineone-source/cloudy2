CREATE TABLE "pinned_event_cache" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"events" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pinned_event_cache_singleton" CHECK ("pinned_event_cache"."id" = 'singleton')
);
