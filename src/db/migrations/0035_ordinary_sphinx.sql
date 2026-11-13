ALTER TABLE "bible_studies" ADD COLUMN IF NOT EXISTS "scripture_references" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bible_studies" ADD COLUMN IF NOT EXISTS "outline_asset_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bible_studies_outline_asset_id_media_assets_id_fk'
      AND conrelid = 'bible_studies'::regclass
  ) THEN
    ALTER TABLE "bible_studies"
      ADD CONSTRAINT "bible_studies_outline_asset_id_media_assets_id_fk"
      FOREIGN KEY ("outline_asset_id") REFERENCES "public"."media_assets"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;