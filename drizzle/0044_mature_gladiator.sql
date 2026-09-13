CREATE TABLE "parade_email_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"send_date" date NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "parade_email_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "parade_email_recipient_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "parade_email_send_time" text DEFAULT '07:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "parade_email_subject_template" text DEFAULT '[cloudy2] Parade State — {date}' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "parade_email_body_template" text DEFAULT 'Parade State for {date} ({weekday})

Total: {present} present / {total} ({outOfCamp} out of camp)

{departments}' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "parade_email_sends_date_idx" ON "parade_email_sends" USING btree ("send_date");