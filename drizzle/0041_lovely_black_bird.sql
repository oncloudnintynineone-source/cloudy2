CREATE TABLE "cache_invalidation" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"epoch" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cache_invalidation_singleton" CHECK ("cache_invalidation"."id" = 'singleton')
);
