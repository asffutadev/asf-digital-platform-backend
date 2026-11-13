ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "chk_events_status";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "status" SET DEFAULT 'Draft';--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "image_asset_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_image_asset_id_media_assets_id_fk'
      AND conrelid = 'events'::regclass
  ) THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "events_image_asset_id_media_assets_id_fk"
      FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_status_start_time" ON "events" USING btree ("status","start_time");--> statement-breakpoint
ALTER TABLE "events"
  ADD CONSTRAINT "chk_events_status"
  CHECK ("events"."status" IN ('Draft', 'Active', 'Cancelled'));
