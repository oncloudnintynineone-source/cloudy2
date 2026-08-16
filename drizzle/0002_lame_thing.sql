ALTER TABLE "users" ADD COLUMN "department_id" uuid;--> statement-breakpoint

-- Backfill: pick the primary membership when present, otherwise the membership
-- whose department sorts first; fall back to the first department for any user
-- without a membership so the NOT NULL constraint below holds.
UPDATE "users" u
SET "department_id" = COALESCE(
  (
    SELECT ud."department_id"
    FROM "user_departments" ud
    LEFT JOIN "departments" d ON d."id" = ud."department_id"
    WHERE ud."user_id" = u."id"
    ORDER BY ud."is_primary" DESC, d."sort_order" ASC, d."name" ASC
    LIMIT 1
  ),
  (SELECT "id" FROM "departments" ORDER BY "sort_order" ASC, "name" ASC LIMIT 1)
);--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "department_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "users_department_idx" ON "users" USING btree ("department_id");--> statement-breakpoint

ALTER TABLE "user_departments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "user_departments" CASCADE;
