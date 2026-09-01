CREATE TABLE "event_type_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "group_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "event_type_groups_name_idx" ON "event_type_groups" USING btree ("name");--> statement-breakpoint
CREATE INDEX "event_type_groups_sort_idx" ON "event_type_groups" USING btree ("sort_order");--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_group_id_event_type_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."event_type_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_types_group_idx" ON "event_types" USING btree ("group_id");