ALTER TABLE "announcements" DROP CONSTRAINT IF EXISTS "chk_announcements_status";--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "category" varchar(30) DEFAULT 'General' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "image_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "attachment_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "publish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "audience" jsonb DEFAULT '{"gender":[],"subgroups":[],"levels":[]}'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcements_image_asset_id_media_assets_id_fk'
      AND conrelid = 'announcements'::regclass
  ) THEN
    ALTER TABLE "announcements"
      ADD CONSTRAINT "announcements_image_asset_id_media_assets_id_fk"
      FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_announcements_category" ON "announcements" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_announcements_publish_at" ON "announcements" USING btree ("publish_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_announcements_audience" ON "announcements" USING gin ("audience");--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_announcements_category'
      AND conrelid = 'announcements'::regclass
  ) THEN
    ALTER TABLE "announcements"
      ADD CONSTRAINT "chk_announcements_category"
      CHECK ("announcements"."category" IN ('General', 'Prayer', 'Event', 'Academic', 'Urgent', 'Other'));
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_announcements_status'
      AND conrelid = 'announcements'::regclass
  ) THEN
    ALTER TABLE "announcements"
      ADD CONSTRAINT "chk_announcements_status"
      CHECK ("announcements"."status" IN ('Draft', 'Scheduled', 'Pending Review', 'Revision Requested', 'Approved', 'Published', 'Archived'));
  END IF;
END $$;
