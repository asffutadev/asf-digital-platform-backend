ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "category" varchar(50) DEFAULT 'General' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_media_assets_category" ON "media_assets" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_media_assets_resource_type" ON "media_assets" USING btree ("resource_type");
