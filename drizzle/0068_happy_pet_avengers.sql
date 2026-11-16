CREATE TABLE "widget_feed_cache" (
	"user_id" uuid NOT NULL,
	"view_id" text NOT NULL,
	"body" text NOT NULL,
	"epoch" bigint DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "widget_feed_cache_user_id_view_id_pk" PRIMARY KEY("user_id","view_id")
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "feed_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "widget_feed_cache" ADD CONSTRAINT "widget_feed_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;