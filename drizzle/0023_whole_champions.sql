ALTER TABLE "settings" ADD COLUMN "kah_email_subject_template" text DEFAULT '[cloudy2] KAH limit exceeded — {event}' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "kah_email_body_template" text DEFAULT 'Key Appointment Holder limit exceeded.

After "{event}" was saved by {actor}, the following groups are below
their required in-country percentage for the affected period:

{breaches}

Event window: {window}

This is a notification only — the event was saved. Adjust the event or
the KAH groups in Settings if this was not intended.' NOT NULL;