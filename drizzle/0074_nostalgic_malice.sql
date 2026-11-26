CREATE TABLE "metrics_activity" (
	"day" date PRIMARY KEY NOT NULL,
	"minutes" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_claim" (
	"kind" text NOT NULL,
	"day" date NOT NULL,
	"status" text DEFAULT 'claimed' NOT NULL,
	"instance" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "metrics_claim_kind_day_pk" PRIMARY KEY("kind","day")
);
--> statement-breakpoint
CREATE TABLE "metrics_day" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"label_key" text DEFAULT '' NOT NULL,
	"value" double precision NOT NULL,
	"source" text DEFAULT 'sql' NOT NULL,
	"detail" jsonb,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_day_day_metric_label_key_pk" PRIMARY KEY("day","metric","label_key")
);
--> statement-breakpoint
CREATE TABLE "metrics_running" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"label_key" text DEFAULT '' NOT NULL,
	"value" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_running_day_metric_label_key_pk" PRIMARY KEY("day","metric","label_key")
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "metrics_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "metrics_snapshot_time" text DEFAULT '23:55' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "metrics_snapshot_days" jsonb DEFAULT '[1,2,3,4,5,6,7]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "metrics_neon_cap_compute_hours" double precision DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "metrics_neon_cap_egress_bytes" double precision DEFAULT 5368709120 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "metrics_neon_cap_storage_bytes" double precision DEFAULT 536870912 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "metrics_egress_calibration" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "metrics_retention_days" integer DEFAULT 365 NOT NULL;--> statement-breakpoint
CREATE INDEX "metrics_claim_claimed_idx" ON "metrics_claim" USING btree ("claimed_at");--> statement-breakpoint
CREATE INDEX "metrics_day_day_metric_idx" ON "metrics_day" USING btree ("day","metric");