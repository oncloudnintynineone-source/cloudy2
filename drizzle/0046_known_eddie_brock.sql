ALTER TABLE "user_preferences" DROP CONSTRAINT "user_preferences_dashboard_active_view_id_user_dashboard_views_id_fk";
--> statement-breakpoint
DROP INDEX "user_preferences_active_view_idx";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "dashboard_active_view_id";