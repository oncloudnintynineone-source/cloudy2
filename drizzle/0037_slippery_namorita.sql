CREATE TABLE "user_dashboard_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"view_type" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"cal_filter" jsonb,
	"users_filter" jsonb,
	"types_filter" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"dashboard_active_view_id" uuid,
	"parade_cal" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parade_users" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_dashboard_views" ADD CONSTRAINT "user_dashboard_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_dashboard_active_view_id_user_dashboard_views_id_fk" FOREIGN KEY ("dashboard_active_view_id") REFERENCES "public"."user_dashboard_views"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_dashboard_views_user_sort_idx" ON "user_dashboard_views" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "user_preferences_active_view_idx" ON "user_preferences" USING btree ("dashboard_active_view_id");