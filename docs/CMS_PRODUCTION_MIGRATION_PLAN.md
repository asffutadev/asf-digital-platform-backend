# CMS Production Migration Plan

## 1. Backup and checkpoint

1. In the Neon ASF FUTA project, create a branch of `production` as the migration checkpoint.
   Keep the branch ID and timestamp with the release record.
2. Export the exact production website configuration and section data as JSON:

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

Store both files outside the application release, and record counts:

```sql
SELECT status, count(*) FROM public.website_configurations GROUP BY status;
SELECT count(*) FROM public.website_sections;
```

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
  ON DELETE restrict ON UPDATE no action;

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
