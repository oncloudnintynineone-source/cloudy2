CREATE TABLE "user_calendar_access" (
	"user_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"role" text DEFAULT 'reader' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_calendar_access_user_id_calendar_id_pk" PRIMARY KEY("user_id","calendar_id")
);
--> statement-breakpoint
ALTER TABLE "user_calendar_access" ADD CONSTRAINT "user_calendar_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_calendar_access" ADD CONSTRAINT "user_calendar_access_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_calendar_access_calendar_idx" ON "user_calendar_access" USING btree ("calendar_id");