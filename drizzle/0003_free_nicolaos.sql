-- Departments are now Google Calendars. The `calendars` table becomes the
-- department registry (kind = 'department'); Google Calendar is the source of
-- truth for existence and names. Existing department/calendar data is dropped
-- (clean slate) and every user is unassigned until departments are recreated
-- as Google Calendars.
--> statement-breakpoint
DELETE FROM "calendars";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_department_id_departments_id_fk";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "department_id" DROP NOT NULL;--> statement-breakpoint
UPDATE "users" SET "department_id" = NULL;--> statement-breakpoint
DROP INDEX "calendars_department_idx";--> statement-breakpoint
ALTER TABLE "calendars" DROP COLUMN "department_id";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_calendars_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."calendars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP TABLE "departments" CASCADE;
