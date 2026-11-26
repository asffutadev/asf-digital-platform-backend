# Round 7 Report

## Scope

- Branch: `cms-shared-content`
- No commit
- No push
- Database migrations applied: `0037_aspiring_leper_queen.sql`, `0038_sour_dragon_lord.sql`

## Public program type mapping

The public program response now derives `programType` from `events.mode`, not `category`:

- `Online / Zoom` -> `Online`
- `In-Person` -> `Physical`
- `Hybrid` -> `Physical`

Implementation:

```sql
CASE
  WHEN events.mode = 'Online / Zoom' THEN 'Online'
  WHEN events.mode IN ('In-Person', 'Hybrid') THEN 'Physical'
END
```

The public test uses categories that differ from the expected mode mapping:

- `In-Person` with category `Prayer` -> `Physical`
- `Online / Zoom` with category `Outreach` -> `Online`
- `Hybrid` with category `Special Program` -> `Physical`

Raw JSON from the test:

```json
{"inPerson":{"id":"fad1bc55-76f1-4373-a69a-be8068b3d503","title":"Public Program","startTime":"2026-11-25T22:17:31.515Z","location":"FUTA","description":"Public description","guestMinister":"Guest Minister","programType":"Physical","imageUrl":null,"status":"Published"},"online":{"id":"31f4d9f2-8d35-4c0b-a192-d5ccd46c7928","title":"Online Public Program","startTime":"2026-11-26T22:17:32.784Z","location":null,"description":null,"guestMinister":null,"programType":"Online","imageUrl":null,"status":"Published"},"hybrid":{"id":"94228d84-853e-4f5b-9241-84aac0c436f6","title":"Hybrid Public Program","startTime":"2026-11-27T22:17:32.133Z","location":null,"description":null,"guestMinister":null,"programType":"Physical","imageUrl":null,"status":"Published"}}
```

## Pagination result

The earlier `data.length` 1 versus `meta.total` 13 was not evidence of differing filters in the current repository. The page query and count query both use the same `where` condition.

The page query applies `limit` and `offset`; the count query omits pagination and counts all rows matching the same filter.

Raw run with `limit=20`:

```text
PUBLIC_LIMIT20_DATA_LENGTH=20
PUBLIC_LIMIT20_META_TOTAL=40
```

Raw response summary:

```json
{"success":true,"data":[{"title":"Public Program","programType":"Physical"},{"title":"Online Public Program","programType":"Online"},{"title":"Hybrid Public Program","programType":"Physical"}],"message":"Programs retrieved","meta":{"total":40,"page":1,"limit":20}}
```

The test inserted 25 future qualifying rows and also found existing qualifying rows. It therefore returned 20 records while reporting 40 total matching upcoming records.

## CMS production migration plan

The full current text of `docs/CMS_PRODUCTION_MIGRATION_PLAN.md` is reproduced below.

```markdown
# CMS Production Migration Plan

## 1. Backup and checkpoint

1. In the Neon ASF FUTA project, create a branch of `production` as the migration checkpoint.
   Keep the branch ID and timestamp with the release record.
2. Create a database checkpoint branch and merge only migration-only changes there before touching production.
   Record the source branch, checkpoint branch ID, commit, migration filenames, and timestamp.
3. Export the exact production website configuration and section data as JSON:

```sql
\copy (
  SELECT coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb)
  FROM (SELECT * FROM public.website_configurations c) c
) TO '/tmp/asf-website-configurations.json';

\copy (
  SELECT coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb)
  FROM (SELECT * FROM public.website_sections s) s
) TO '/tmp/asf-website-sections.json';
```

Store both files outside the application release, in the release record, and record counts:

```sql
SELECT status, count(*) FROM public.website_configurations GROUP BY status;
SELECT count(*) FROM public.website_sections;
```

Back up application code and migration metadata too: record the application commit, migration journal entry, and the exact 0037/0038 SQL files. A database-only copy is not sufficient for a reproducible merge.

## 1A. Pre-flight merge

1. Compare the 0037/0038 files in the application branch against the checkpoint branch.
2. Confirm migrations are applied once, in order, and that no later migration creates or removes the CMS tables or `is_public`.
3. Apply 0037 and 0038 to the checkpoint branch first.
4. Merge the application branch into the checkpoint-branch test deployment only after migration verification passes.
5. Confirm the test deployment uses the merged application commit and the migrated checkpoint database.

Pre-flight SQL:

```sql
SELECT count(*) FROM public.website_configurations;
SELECT count(*) FROM public.website_sections;
SELECT count(*) FROM public.website_publish_history;
SELECT count(*) FROM public.website_settings;
```

If these queries fail, stop; the migration prerequisite is missing.

## 2. Exact additive migration SQL

Run migration `0037` first:

```sql
CREATE TABLE IF NOT EXISTS public.website_settings (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "active_theme_id" varchar(60) DEFAULT 'classic-auditoria' NOT NULL
);

CREATE TABLE IF NOT EXISTS public.website_publish_history (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "theme_id" varchar(60) NOT NULL,
  "version" integer NOT NULL,
  "copy" jsonb NOT NULL,
  "sections" jsonb NOT NULL,
  "published_by" uuid,
  "published_at" timestamp with time zone NOT NULL
);

ALTER TABLE public.website_sections
  ADD COLUMN IF NOT EXISTS "image_asset_id" uuid;

ALTER TABLE public.website_publish_history
  DROP CONSTRAINT IF EXISTS "website_publish_history_published_by_users_id_fk";
ALTER TABLE public.website_publish_history
  ADD CONSTRAINT "website_publish_history_published_by_users_id_fk"
  FOREIGN KEY ("published_by") REFERENCES public.users("id")
  ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_website_publish_history_theme"
  ON public.website_publish_history ("theme_id", "published_at");

ALTER TABLE public.website_sections
  DROP CONSTRAINT IF EXISTS "website_sections_image_asset_id_media_assets_id_fk";
ALTER TABLE public.website_sections
  ADD CONSTRAINT "website_sections_image_asset_id_media_assets_id_fk"
  FOREIGN KEY ("image_asset_id") REFERENCES public.media_assets("id")
  ON DELETE set null ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_website_config_status"
  ON public.website_configurations ("status");

INSERT INTO public.website_settings ("id", "active_theme_id")
VALUES (1, 'classic-auditoria')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO public.website_configurations ("status", "copy")
VALUES ('draft', '{}'::jsonb), ('published', '{}'::jsonb)
ON CONFLICT ("status") DO NOTHING;
```

Do not add or retain `theme_id` on `website_configurations`.

Run migration `0038` second:

```sql
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;
```

## 3. Real verification queries

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'website_settings',
    'website_publish_history',
    'website_configurations',
    'website_sections',
    'announcements'
  )
ORDER BY table_name;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'website_sections' AND column_name = 'image_asset_id')
    OR (table_name = 'announcements' AND column_name = 'is_public')
  );

SELECT status, count(*)
FROM public.website_configurations
GROUP BY status
ORDER BY status;

SELECT count(*) AS draft_count
FROM public.website_configurations
WHERE status = 'draft';

SELECT count(*) AS published_count
FROM public.website_configurations
WHERE status = 'published';

SELECT id, active_theme_id
FROM public.website_settings;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'website_configurations'
  AND column_name = 'theme_id';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'website_configurations',
    'website_sections',
    'website_publish_history'
  )
ORDER BY tablename, indexname;

SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN (
  'public.website_sections'::regclass,
  'public.website_publish_history'::regclass
)
ORDER BY conrelid::regclass::text, conname;
```

Expected:

- exactly one `draft` and one `published` row;
- `website_settings.id = 1` and `active_theme_id = classic-auditoria`;
- no `theme_id` column;
- `website_sections.image_asset_id` is `uuid`;
- `announcements.is_public` is `boolean`, `NOT NULL`, default `false`;
- section and publish-history foreign keys and indexes exist.
- `website_publish_history_published_by_users_id_fk` has `ON DELETE SET NULL`.

## 4. Safe deploy order

1. Create and verify the Neon checkpoint branch.
2. Back up both JSON exports.
3. Apply migration `0037`, then migration `0038`, on production.
4. Run all verification queries and stop on any mismatch.
5. Push and deploy application code only after the migrations are committed and verified.

This order is required because the old application can ignore the new CMS tables and `is_public` column, while the new application requires these database objects.

## 5. Rollback

1. Roll back the application deployment before database changes.
2. Restore the JSON configuration and section exports to the checkpoint environment if application data was modified.
3. Use the checkpoint Neon branch for a database-level rollback if a full restore is required.
4. If only the deployment migration is being reversed, remove new application dependencies first, then:

```sql
ALTER TABLE public.announcements
  DROP COLUMN IF EXISTS "is_public";

ALTER TABLE public.website_sections
  DROP CONSTRAINT IF EXISTS "website_sections_image_asset_id_media_assets_id_fk";
ALTER TABLE public.website_sections
  DROP COLUMN IF EXISTS "image_asset_id";

DROP INDEX IF EXISTS public."idx_website_publish_history_theme";
DROP TABLE IF EXISTS public.website_publish_history;
DROP TABLE IF EXISTS public.website_settings;
```

Drop the CMS tables and columns only after confirming no deployed code is reading or writing them.
```

## Test results

```text
publicEndpoints.test.ts
Test Files  1 passed (1)
Tests       3 passed (3)

events.test.ts
Test Files  1 passed (1)
Tests       12 passed (12)

cms.test.ts
Test Files  1 passed (1)
Tests       21 passed (21)
```
