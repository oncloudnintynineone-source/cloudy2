CREATE TABLE "kah_breach_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"breach_pct" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kah_breach_notifications" ADD CONSTRAINT "kah_breach_notifications_group_id_kah_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."kah_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kah_breach_notif_dedup_idx" ON "kah_breach_notifications" USING btree ("group_id","window_start","window_end","breach_pct");