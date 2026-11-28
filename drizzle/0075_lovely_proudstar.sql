ALTER TABLE "settings" ALTER COLUMN "metrics_snapshot_time" SET DEFAULT '00:05';
--> statement-breakpoint
-- Data: the old default (23:55) could never fire for an office-hours app — the
-- lazy close only runs on activity at/after the cutoff, and nobody has the app
-- open at 23:55, which is how the ledger shipped "No data" forever. Any row
-- still holding the old default is the default, not a choice; move it to the
-- new one. An admin-set time is left alone.
UPDATE "settings" SET "metrics_snapshot_time" = '00:05' WHERE "metrics_snapshot_time" = '23:55';