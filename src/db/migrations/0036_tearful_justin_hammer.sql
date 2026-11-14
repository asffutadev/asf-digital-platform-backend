ALTER TABLE "bible_studies" ADD COLUMN IF NOT EXISTS "study_heading" varchar(255);--> statement-breakpoint
ALTER TABLE "bible_studies" ADD COLUMN IF NOT EXISTS "aims" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bible_studies" ADD COLUMN IF NOT EXISTS "food_for_thought" text;--> statement-breakpoint
DELETE FROM "outline_section_aliases"
WHERE "canonical_key" = 'studyGuide' AND "alias" = 'Food for Thought';--> statement-breakpoint
INSERT INTO "outline_section_aliases" ("canonical_key", "alias")
VALUES
  ('memoryVerseRef', 'Memory Verse to Learn'),
  ('aim', 'Aims'),
  ('foodForThought', 'Food for Thought')
ON CONFLICT ("canonical_key", "alias") DO NOTHING;