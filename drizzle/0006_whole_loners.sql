ALTER TABLE "users" ADD COLUMN "shortname" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_shortname_idx" ON "users" USING btree ("shortname");