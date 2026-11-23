# CMS Production Migration Plan

## Backup and checkpoint

1. Create a Neon branch of `main` and keep it as the rollback/checkpoint branch.
2. Export the production `website_configurations` and `website_sections` rows as JSON:
   ```sql
   COPY (
     SELECT jsonb_agg(row_to_json(w)) FROM (
       SELECT * FROM public.website_configurations
     ) w
   ) TO STDOUT;
   ```
   Export sections separately:
   ```sql
   COPY (
     SELECT jsonb_agg(row_to_json(w)) FROM (
       SELECT * FROM public.website_sections
     ) w
   ) TO STDOUT;
   ```
3. Store the two exports outside application releases and verify row counts and checksums.

## Exact additive migration SQL

Run in this order:

```sql
CREATE TABLE IF NOT EXISTS public.website_settings (
  id integer PRIMARY KEY DEFAULT 1 NOT NULL,
  active_theme_id varchar(60) DEFAULT 'classic-auditoria' NOT NULL
);

INSERT INTO public.website_settings (id, active_theme_id)
VALUES (1, 'classic-auditoria')
ON CONFLICT (id) DO UPDATE SET active_theme_id = EXCLUDED.active_theme_id;

CREATE TABLE IF NOT EXISTS public.website_publish_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  theme_id varchar(60) NOT NULL,
  version integer NOT NULL,
  copy jsonb NOT NULL,
  sections jsonb NOT NULL,
  published_by uuid,
  published_at timestamp with time zone NOT NULL
);

ALTER TABLE public.website_publish_history
  DROP CONSTRAINT IF EXISTS website_publish_history_published_by_users_id_fk;
ALTER TABLE public.website_publish_history
  ADD CONSTRAINT website_publish_history_published_by_users_id_fk
  FOREIGN KEY (published_by) REFERENCES public.users(id) ON DELETE restrict;

CREATE INDEX IF NOT EXISTS idx_website_publish_history_theme
  ON public.website_publish_history (theme_id, published_at);

ALTER TABLE public.website_sections
  ADD COLUMN IF NOT EXISTS image_asset_id uuid;
ALTER TABLE public.website_sections
  DROP CONSTRAINT IF EXISTS website_sections_image_asset_id_media_assets_id_fk;
ALTER TABLE public.website_sections
  ADD CONSTRAINT website_sections_image_asset_id_media_assets_id_fk
  FOREIGN KEY (image_asset_id) REFERENCES public.media_assets(id) ON DELETE set null;

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
```

## CMS shared-content consolidation

After backup and before deploy, consolidate shared content once:

```sql
DROP INDEX IF EXISTS public.uq_website_config_theme_status;
ALTER TABLE public.website_configurations DROP COLUMN IF EXISTS theme_id;
DELETE FROM public.website_configurations;
INSERT INTO public.website_configurations (status, copy)
VALUES ('draft', '{}'::jsonb), ('published', '{}'::jsonb);
CREATE UNIQUE INDEX IF NOT EXISTS uq_website_config_status
  ON public.website_configurations (status);
```

## Raw verification

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('website_settings','website_publish_history','website_configurations','website_sections','announcements');

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'website_sections' AND column_name = 'image_asset_id')
    OR (table_name = 'announcements' AND column_name = 'is_public')
    OR table_name = 'website_configurations');

SELECT status, count(*)
FROM public.website_configurations
GROUP BY status;

SELECT active_theme_id
FROM public.website_settings
WHERE id = 1;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (tablename = 'website_configurations'
    OR tablename = 'website_sections'
    OR tablename = 'website_publish_history');

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN (
  'public.website_sections'::regclass,
  'public.website_configurations'::regclass,
  'public.website_publish_history'::regclass
);
```

## Safe deploy order

1. Create and verify the Neon checkpoint branch.
2. Run migrations first on production.
3. Run the raw verification queries.
4. Push and deploy the application code after migration success.

Migrate first because old code ignores the new tables and columns, and shared CMS code requires the two shared rows. It is safer than pushing code first.

## Rollback

1. Revert application code/deployment.
2. Restore the two JSON exports into the CMS tables if shared consolidation was executed.
3. If required, restore `theme_id` from the JSON backup and recreate `uq_website_config_theme_status`.
4. Drop `announcements.is_public` only after confirming no new public endpoint traffic or code dependency remains.
5. Drop `website_sections.image_asset_id` and CMS tables only after restoring/confirming application compatibility.
6. If database rollback is required, reset to the checkpoint Neon branch rather than modifying production data in place.
