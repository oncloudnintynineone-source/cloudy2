ALTER TABLE "settings" ADD COLUMN "participant_notify_created_title" text DEFAULT '{title}' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "participant_notify_created_body" text DEFAULT 'You''re included in a new event< · {time}>< · {location}>' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "participant_notify_added_title" text DEFAULT '{title}' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "participant_notify_added_body" text DEFAULT 'You''ve been added to this event< · {time}>< · {location}>' NOT NULL;