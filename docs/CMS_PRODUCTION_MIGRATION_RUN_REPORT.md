# CMS Production Migration Run Report

Status: **In progress. Local preparation is being recorded before external Neon and Render steps.**

Branch: `cms-shared-content`

No commit, migration, checkout, merge, push, or production request has been performed by this report.

## Stop conditions

Stop and report the result at every step below. Do not proceed after a failed stop condition.

## Step 0: Preparation

1. Commit all work on `cms-shared-content`.
2. `git status --short` must show only `antislop.md` and nothing else.
3. Open a fresh PowerShell window.
4. Verify this prints nothing:

```powershell
$env:DATABASE_URL
```

If it prints a value, close the window and open another.

Execution result: **Passed. `$env:DATABASE_URL` printed nothing.**

## Step 1: Checkpoint

1. In the Neon console for project `main`, create a branch from the `production` main database named `pre-cms-checkpoint`.
2. Record the branch creation time.
3. In the `main` database SQL Editor, save the output of:

```sql
SELECT status, version, copy, "updatedBy" FROM website_configurations;
SELECT * FROM website_sections ORDER BY "order";
```

If the `updatedBy` column name is `updated_by`, use:

```sql
SELECT * FROM website_configurations;
SELECT * FROM website_sections;
```

Execution result: **Not started**

## Step 2: Pre-flight read-only

In the SQL Editor on `main`, confirm the host is `ep-gentle-frost...`, then run:

```sql
SELECT count(*) FROM drizzle.__drizzle_migrations;
SELECT status, count(*) FROM website_configurations GROUP BY status;
SELECT count(*) FROM website_sections;
```

Expected configuration counts:

- `draft`: 1
- `published`: 1

Execution result: **Not started**

Migration count: **Pending**

Migration journal file count: **39 entries in `src/db/migrations/meta/_journal.json`**

## Step 3: Migrate production

1. In a fresh PowerShell window, set the main database connection string:

```powershell
$env:DATABASE_URL = "<main connection string>"
node -e "const u=new URL(process.env.DATABASE_URL); console.log(u.host, u.pathname)"
```

Required result:

- Host begins with `ep-gentle-frost-ayzpyy1i-pooler`
- Pathname is `/asf_futa`

Stop if the host or database differs.

2. Run:

```powershell
npm run db:migrate
```

Execution result: **Not started**

## Step 4: Verify migration

Run all verification queries in `CMS_PRODUCTION_MIGRATION_PLAN.md`.

Expected results:

- Exactly one `draft` row
- Exactly one `published` row
- `website_settings.id = 1`
- `website_settings.active_theme_id = classic-auditoria`
- No `theme_id` column on `website_configurations`
- `announcements.is_public` is boolean, `NOT NULL`, with default `false`
- `website_sections.image_asset_id` is UUID
- Section foreign key exists
- Publish-history foreign key exists
- Publish-history foreign key uses `ON DELETE SET NULL`
- Required indexes exist

Verification output: **Pending**

Stop if any result differs.

## Step 5: Deploy

Only after migration verification is clean:

```powershell
git checkout main
git merge cms-shared-content
git push
```

Deployment result: **Not started**

Wait for Render to report Live.

## Step 6: Production verification

Run:

```powershell
$base = "https://asf-digital-platform-backend.onrender.com"
(Invoke-RestMethod "$base/api/content/website").data | Select-Object version, themeId
(Invoke-RestMethod "$base/api/public/programs").meta
(Invoke-RestMethod "$base/api/public/announcements").meta
```

Expected:

- CMS response includes `themeId = classic-auditoria`
- CMS response includes a version number
- Public programs endpoint succeeds
- Public announcements endpoint succeeds

Production verification output: **Pending**

## Rollback

If deployment verification fails:

1. Redeploy the previous commit from the Render dashboard.
2. The previous application code is additive-migration-compatible and may run against the new tables.
3. If the CMS data itself looks incorrect, restore using the `pre-cms-checkpoint` Neon branch.
4. Do not drop the migration tables or columns while deployed code may depend on them.
