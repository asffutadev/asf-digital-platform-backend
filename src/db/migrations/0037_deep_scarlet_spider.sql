CREATE TABLE IF NOT EXISTS "public"."website_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"active_theme_id" varchar(60) DEFAULT 'classic-auditoria' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public"."website_publish_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"theme_id" varchar(60) NOT NULL,
	"version" integer NOT NULL,
	"copy" jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "public"."website_publish_history" DROP CONSTRAINT IF EXISTS "website_publish_history_published_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "public"."website_publish_history" ADD CONSTRAINT "website_publish_history_published_by_users_id_fk"
FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_website_publish_history_theme"
ON "public"."website_publish_history" ("theme_id", "published_at");
--> statement-breakpoint
ALTER TABLE "public"."website_sections" ADD COLUMN IF NOT EXISTS "image_asset_id" uuid;
--> statement-breakpoint
ALTER TABLE "public"."website_sections" DROP CONSTRAINT IF EXISTS "website_sections_image_asset_id_media_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "public"."website_sections" ADD CONSTRAINT "website_sections_image_asset_id_media_assets_id_fk"
FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
DROP INDEX IF EXISTS "public"."uq_website_config_theme_status";
--> statement-breakpoint
ALTER TABLE "public"."website_configurations" DROP COLUMN IF EXISTS "theme_id";
--> statement-breakpoint
DELETE FROM "public"."website_configurations";
--> statement-breakpoint
INSERT INTO "public"."website_configurations" ("status", "copy")
VALUES ('draft', '{}'::jsonb), ('published', '{}'::jsonb)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_website_config_status" ON "public"."website_configurations" ("status");
--> statement-breakpoint
INSERT INTO "public"."website_settings" ("id", "active_theme_id")
VALUES (1, 'classic-auditoria')
ON CONFLICT ("id") DO UPDATE SET "active_theme_id" = 'classic-auditoria';
