# ASF Backend Build Report

## Baseline verification — 2026-11-13

### Scope

This section records the pre-Task-1 baseline requested in the project brief. No application source files were changed for this baseline run. The existing in-progress implementation was tested as found.

### Files created or modified

- `docs/BUILD_REPORT.md` — created as the required durable task-by-task accountability report. It contains the real commands, outcomes, database/shared-state notes, and known gaps for this baseline.
- No source, migration, or test files were modified by the baseline test execution.

### Database and shared-state notes

- The four suites run against the configured shared live PostgreSQL database.
- The events, announcements, and media suites completed their own setup/cleanup flows.
- Bible Study setup could not register its first user because the PostgreSQL TLS connection reset. No intentional data cleanup or schema change was performed.
- No migration was generated or applied during this baseline run.

### Commands and real output

#### Events

Command:

```text
npx vitest run tests/events.test.ts --reporter verbose
```

Result:

```text
Test Files  1 passed (1)
Tests       13 passed (13)
```

Vitest emitted the existing non-fatal Vite CommonJS/ESM configuration warning.

#### Announcements

Command:

```text
npx vitest run tests/announcements.test.ts --reporter verbose
```

Result:

```text
Test Files  1 passed (1)
Tests       15 passed (15)
```

Vitest emitted the existing non-fatal Vite CommonJS/ESM configuration warning.

#### Media

Command:

```text
npx vitest run tests/media.test.ts --reporter verbose
```

Result:

```text
Test Files  1 passed (1)
Tests       7 passed (7)
```

Vitest emitted the existing non-fatal Vite CommonJS/ESM configuration warning.

#### Bible Study

Command:

```text
npx vitest run tests/bibleStudy.test.ts --reporter verbose
```

Result:

```text
Test Files  1 failed (1)
Tests       8 failed (8)
Duration    33.31s
```

The first failure was setup registration. The real database error was:

```text
Client network socket disconnected before secure TLS connection was established
code: ECONNRESET
```

The remaining seven failures were dependent setup failures with `Invalid value "undefined" for header "Cookie"`. They do not establish Bible Study feature failures because setup never produced authenticated cookies.

### Known gaps and assumptions

- This is a baseline only; Tasks 1–6 have not been started.
- The Bible Study baseline must be rerun when the shared database connection is healthy before using it as a feature regression signal.
- The existing full-suite academic-progression timeout remains unrelated and was not touched, per the brief.

### TypeScript check

Command:

```text
npx tsc --noEmit
```

Result:

```text
Process exited with code 0
```

No TypeScript diagnostics were emitted.

### Commit

The existing implementation scope was committed locally, with no push:

```text
3d861a3 Members: protected-member rules, temporary password reset with forced change, President-only roles, directory filters
```

The required co-author trailer was included. The accountability report itself remains a separate uncommitted documentation change so it can continue to receive one section per task.

## Task 1 — Programs / Events — 2026-11-13

### Files created, modified, and deleted

No files were deleted. The following files were created or modified:

- `src/db/schema/events.ts` — now declares `imageAssetId`, keeps legacy columns for existing rows, defaults new rows to stored `Draft`, permits stored `Draft`, `Active`, and `Cancelled`, and adds the composite `(status, start_time)` index. The old status check was expanded; legacy storage columns were retained rather than destructively removed.
- `src/db/migrations/0032_slim_malcolm_colcord.sql` — additive, idempotent migration adding `image_asset_id`, its `SET NULL` foreign key, the status check update, the status/start-time index, and the Draft default. `DROP CONSTRAINT IF EXISTS`, `ADD COLUMN IF NOT EXISTS`, guarded foreign-key creation, and `CREATE INDEX IF NOT EXISTS` were used because the generated SQL was not fully idempotent.
- `src/db/migrations/meta/0032_snapshot.json` — Drizzle schema snapshot generated for the Task 1 schema.
- `src/db/migrations/meta/_journal.json` — records migration 0032.
- `src/modules/events/events.validation.ts` — replaces the legacy event payload with the strict Programs contract, including UTC timestamps, `guestMinister`, `programType`, `imageAssetId`, query filters, pagination, and UUID validation. Removed fields are rejected as validation errors instead of silently stripped.
- `src/modules/events/events.repository.ts` — adds joined asset URL resolution, SQL-side visibility/filter/archive predicates, pagination, a single count query paired with the page query, lifecycle updates, deletion, and asset existence lookup.
- `src/modules/events/events.service.ts` — maps stored `Active` to API `Published`, maps stored modes to `Physical`/`Online`, computes archive state at read time, validates assets, enforces draft-only edits/deletes and lifecycle transitions, and hides drafts from non-Publicity readers.
- `src/modules/events/events.controller.ts` — validates query/body/path inputs, returns pagination metadata, exposes detail/publish/delete handlers, and applies the Publicity-only draft visibility check.
- `src/modules/events/events.routes.ts` — adds `GET /:id`, `PATCH /:id/publish`, and `DELETE /:id`; all writes use the existing `requireOffice("publicity-coordinator")` guard.
- `tests/events.test.ts` — replaces legacy payload tests with 12 integration cases covering all requested visibility, permissions, lifecycle, filters, archive, pagination, UTC, UUID, deletion, and asset behavior.
- `tests/rbac.test.ts` — updates the President write-block test payload to the required Programs shape.

### Database change

Generated migration command:

```text
npx drizzle-kit generate
```

The generated SQL was read and corrected for idempotency before application. The final migration SQL is:

```sql
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "chk_events_status";
ALTER TABLE "events" ALTER COLUMN "status" SET DEFAULT 'Draft';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "image_asset_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_image_asset_id_media_assets_id_fk'
      AND conrelid = 'events'::regclass
  ) THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "events_image_asset_id_media_assets_id_fk"
      FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_events_status_start_time"
  ON "events" USING btree ("status","start_time");
ALTER TABLE "events"
  ADD CONSTRAINT "chk_events_status"
  CHECK ("events"."status" IN ('Draft', 'Active', 'Cancelled'));
```

Application command and real output:

```text
npm run db:migrate
[✓] migrations applied successfully!
```

Verification query:

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'events'
  AND column_name = 'image_asset_id';

SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'chk_events_status';

SELECT indexname
FROM pg_indexes
WHERE indexname = 'idx_events_status_start_time';
```

Real verification output:

```json
{
  "columns": [
    {
      "column_name": "image_asset_id",
      "data_type": "uuid",
      "column_default": null,
      "is_nullable": "YES"
    }
  ],
  "constraints": [
    {
      "constraint_name": "chk_events_status",
      "check_clause": "((status)::text = ANY ((ARRAY['Draft'::character varying, 'Active'::character varying, 'Cancelled'::character varying])::text[]))"
    }
  ],
  "indexes": [
    {
      "indexname": "idx_events_status_start_time"
    }
  ]
}
```

### Endpoint contract

- `GET /api/events` — authenticated members see only Published/Cancelled; Publicity sees Drafts too. Supports `filter`, `programType`, `status`, title `search`, `archived`, `page`, and `limit`. Returns Programs plus `{ total, page, limit }`; invalid values return `400 VALIDATION_ERROR`.
- `GET /api/events/:id` — authenticated; Drafts return `404 EVENT_NOT_FOUND` to non-Publicity readers.
- `GET /api/events/featured` — authenticated; returns the earliest upcoming Published program or `404 NO_UPCOMING_EVENT`.
- `POST /api/events` — Publicity office only; creates Drafts. Accepts only title, UTC `startTime`, location, description, optional `guestMinister`, `programType`, and optional UUID `imageAssetId`; returns `201`.
- `PUT /api/events/:id` — Publicity office only; edits Drafts only, otherwise `409 ONLY_DRAFT_EDITABLE`.
- `PATCH /api/events/:id/publish` — Publicity office only; Draft → Published, otherwise `409 ONLY_DRAFT_PUBLISHABLE`.
- `PATCH /api/events/:id/cancel` — Publicity office only; Published → Cancelled, repeated cancellation returns `409 ALREADY_CANCELLED`.
- `DELETE /api/events/:id` — Publicity office only; deletes Drafts only, otherwise `409 ONLY_DRAFT_DELETABLE`.

All malformed UUID paths return `400 INVALID_ID_FORMAT`; missing assets return `400 MEDIA_ASSET_NOT_FOUND`. Existing stored `Active` rows are exposed as `Published`, so no data rewrite was needed.

### Query-quality review

- List filtering, visibility, archive calculation, title search, status, and program type are applied in SQL before pagination.
- Asset URLs are resolved with one left join rather than one query per event.
- The list uses one page query and one total count query; it does not fetch an unbounded result set.
- The new `(status, start_time)` index supports the principal lifecycle/time filtering path. Existing `start_time` and `status` indexes were retained for compatibility with other query shapes.
- Archive state is computed at read time using the 90-day cutoff; no cron or automatic deletion was introduced.

### Real TypeScript and test output

TypeScript:

```text
npx tsc --noEmit
Process exited with code 0
No TypeScript diagnostics were emitted.
```

Events:

```text
Test Files  1 passed (1)
Tests       12 passed (12)
Duration    63.84s
```

RBAC:

```text
Test Files  1 passed (1)
Tests       12 passed (12)
```

Vitest emitted the existing non-fatal Vite CommonJS/ESM configuration warning.

### Known gaps, assumptions, and uncertainties

- Legacy database columns (`category`, `end_time`, `speaker_role`, `theme`, `mode`, and `image_url`) remain in the schema so existing data is preserved. They are no longer accepted in create/update requests; legacy `image_url` is used only as a fallback when no asset URL exists.
- The API does not expose a separate stored `Published` value; it intentionally maps the existing database value `Active` to the new API status.
- A member requesting `status=Draft` receives an empty result rather than an authorization error because the visibility predicate always excludes drafts.
- Existing live test data is not deleted automatically, in accordance with the project brief.

### Task 1 commit

Task 1 is ready for local commit after review. No push was performed.

## Task 2 — Announcements — 2026-11-13

### Files created, modified, and deleted

No files were deleted. The following files were created or modified:

- `src/db/schema/announcements.ts` — adds category, image asset, attachment IDs, publish time, and JSONB audience fields; adds status/category checks and indexes for category, publish time, and audience; adds a nullable image asset foreign key. Existing columns and rows remain intact.
- `src/db/migrations/0033_flippant_speed_demon.sql` — additive/idempotent migration for the new announcement fields, checks, indexes, and image foreign key. The generated SQL was read and rewritten because its raw `ALTER`, `ADD CONSTRAINT`, and `CREATE INDEX` statements were not fully idempotent.
- `src/db/migrations/meta/0033_snapshot.json` — Drizzle snapshot for the Task 2 schema.
- `src/db/migrations/meta/_journal.json` — records migration 0033.
- `src/modules/announcements/announcements.validation.ts` — adds strict category, audience, asset, schedule, status, pagination, and filter validation. Audience arrays are canonicalized and deduplicated.
- `src/modules/announcements/announcements.repository.ts` — adds SQL-side status/effective-schedule filtering, title/category/audience filters, member targeting, pagination, count, asset validation lookup, joined image URLs, and delete/update operations. The viewer row is joined in both page and count queries so targeting never leaks and count remains correct.
- `src/modules/announcements/announcements.service.ts` — implements direct publish, review workflow, revision editing, scheduling, effective scheduled status, archive/delete rules, asset validation, and response mapping.
- `src/modules/announcements/announcements.controller.ts` — validates IDs, bodies, and query parameters; adds detail, schedule, update, and delete handlers; returns pagination metadata.
- `src/modules/announcements/announcements.routes.ts` — adds `GET /:id`, `PATCH /:id/schedule`, and `DELETE /:id`; preserves review endpoints and Publicity-only writes.
- `src/jobs/announcementScheduler.ts` — supplies the new required default category, attachment list, and unrestricted audience when creating urgent recurring announcements.
- `tests/announcements.test.ts` — adds coverage for pagination metadata, category/assets, direct publish, gender targeting, effective scheduling, and draft-only deletion while retaining review/revision coverage.

### Database change

Generated migration command:

```text
npx drizzle-kit generate
```

Final migration SQL after idempotency review:

```sql
ALTER TABLE "announcements" DROP CONSTRAINT IF EXISTS "chk_announcements_status";
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "category" varchar(30) DEFAULT 'General' NOT NULL;
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "image_asset_id" uuid;
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "attachment_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "publish_at" timestamp with time zone;
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "audience" jsonb DEFAULT '{"gender":[],"subgroups":[],"levels":[]}'::jsonb NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'announcements_image_asset_id_media_assets_id_fk'
      AND conrelid = 'announcements'::regclass
  ) THEN
    ALTER TABLE "announcements"
      ADD CONSTRAINT "announcements_image_asset_id_media_assets_id_fk"
      FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_announcements_category" ON "announcements" USING btree ("category");
CREATE INDEX IF NOT EXISTS "idx_announcements_publish_at" ON "announcements" USING btree ("publish_at");
CREATE INDEX IF NOT EXISTS "idx_announcements_audience" ON "announcements" USING gin ("audience");
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_announcements_category'
      AND conrelid = 'announcements'::regclass
  ) THEN
    ALTER TABLE "announcements"
      ADD CONSTRAINT "chk_announcements_category"
      CHECK ("announcements"."category" IN ('General', 'Prayer', 'Event', 'Academic', 'Urgent', 'Other'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_announcements_status'
      AND conrelid = 'announcements'::regclass
  ) THEN
    ALTER TABLE "announcements"
      ADD CONSTRAINT "chk_announcements_status"
      CHECK ("announcements"."status" IN ('Draft', 'Scheduled', 'Pending Review', 'Revision Requested', 'Approved', 'Published', 'Archived'));
  END IF;
END $$;
```

Application command and real output:

```text
npm run db:migrate
[✓] migrations applied successfully!
```

Verification query:

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'announcements'
  AND column_name IN ('category','image_asset_id','attachment_asset_ids','publish_at','audience')
ORDER BY column_name;

SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name IN ('chk_announcements_status','chk_announcements_category')
ORDER BY constraint_name;

SELECT indexname
FROM pg_indexes
WHERE indexname IN ('idx_announcements_category','idx_announcements_publish_at','idx_announcements_audience')
ORDER BY indexname;
```

Real verification output:

```json
{
  "columns": [
    {"column_name":"attachment_asset_ids","data_type":"jsonb","column_default":"'[]'::jsonb","is_nullable":"NO"},
    {"column_name":"audience","data_type":"jsonb","column_default":"'{\"gender\": [], \"levels\": [], \"subgroups\": []}'::jsonb","is_nullable":"NO"},
    {"column_name":"category","data_type":"character varying","column_default":"'General'::character varying","is_nullable":"NO"},
    {"column_name":"image_asset_id","data_type":"uuid","column_default":null,"is_nullable":"YES"},
    {"column_name":"publish_at","data_type":"timestamp with time zone","column_default":null,"is_nullable":"YES"}
  ],
  "constraints": [
    {"constraint_name":"chk_announcements_category","check_clause":"category is restricted to General, Prayer, Event, Academic, Urgent, Other"},
    {"constraint_name":"chk_announcements_status","check_clause":"status is restricted to Draft, Scheduled, Pending Review, Revision Requested, Approved, Published, Archived"}
  ],
  "indexes": [
    {"indexname":"idx_announcements_audience"},
    {"indexname":"idx_announcements_category"},
    {"indexname":"idx_announcements_publish_at"}
  ]
}
```

### Endpoint contract

- `GET /api/announcements` — authenticated. Members receive only effective Published, non-expired announcements matching gender, subgroup, and academic-level targeting. Publicity sees all statuses. Supports title `search`, `category`, `status`, Publicity `audience=all|restricted|unrestricted`, `page`, and `limit`; returns pagination metadata and `400 VALIDATION_ERROR` for unknown values.
- `GET /api/announcements/:id` — authenticated; returns `404 ANNOUNCEMENT_NOT_FOUND` when a member is not targeted or the item is not effectively published.
- `POST /api/announcements` — Publicity office only; accepts category, image asset ID, attachment asset IDs, publish time, audience, and existing message/priority fields. `isUrgent` publishes immediately; otherwise the item starts as Draft.
- `PUT /api/announcements/:id` — Publicity office only; Draft and Revision Requested items are editable and return to Draft. Other statuses return `409 INVALID_STATUS`.
- `PATCH /api/announcements/:id/submit-review` — Publicity office only; Draft/Revision Requested → Pending Review.
- `PATCH /api/announcements/:id/approve` — Publicity office only; Pending Review → Approved.
- `PATCH /api/announcements/:id/request-revision` — Publicity office only; Pending Review → Revision Requested and requires notes.
- `PATCH /api/announcements/:id/publish` — Publicity office only; Draft or Approved → Published.
- `PATCH /api/announcements/:id/schedule` — Publicity office only; Draft → Scheduled with `publishAt`. Reads expose effective Published when the timestamp is due.
- `PATCH /api/announcements/:id/archive` — Publicity office only; Published/Scheduled → Archived.
- `DELETE /api/announcements/:id` — Publicity office only; Draft only, otherwise `409 ONLY_DRAFT_DELETABLE`.

All malformed UUID paths return `400 INVALID_ID_FORMAT`; missing image or attachment assets return `400 MEDIA_ASSET_NOT_FOUND`.

### Query-quality review and bug fixed

- Audience targeting is enforced in SQL using the joined member row, so hidden announcements are excluded before both list results and detail responses.
- Missing/empty audience criteria are unrestricted; criteria combine with AND and values inside one criterion combine with PostgreSQL JSONB-array membership (OR).
- Member records with no subgroup cannot match a subgroup-targeted announcement.
- Lists are paginated and use one page query plus one count query; image URLs use a join rather than N+1 lookups.
- Added B-tree indexes for category and publish time plus a GIN index for the JSONB audience.
- The first implementation incorrectly applied `users` audience predicates to the count query without joining `users`, producing PostgreSQL `42P01 missing FROM-clause entry for table "users"`. The count query was corrected to use the same viewer join as the page query, then the suite was rerun successfully.

### Real TypeScript and test output

TypeScript:

```text
npx tsc --noEmit
Process exited with code 0
No TypeScript diagnostics were emitted.
```

Announcements:

```text
Test Files  1 passed (1)
Tests       17 passed (17)
```

RBAC:

```text
Test Files  1 passed (1)
Tests       12 passed (12)
```

Vitest emitted the existing non-fatal Vite CommonJS/ESM configuration warning.

### Known gaps, assumptions, and uncertainties

- `attachmentAssetIds` are validated and preserved as IDs; the response does not expand them into a URL array. The image asset is expanded to `imageUrl` through the server-side join.
- Existing `expiresAt` behavior is preserved for member reads; Publicity can still inspect expired records.
- The existing recurring scheduler remains operational and now supplies defaults for the expanded create input.
- Existing live test data is not deleted automatically.

### Task 2 commit

Task 2 is ready for local commit after review. No push was performed.

## Task 3 — Media — 2026-11-13

### Files created and modified

- `src/db/schema/mediaAssets.ts` — adds category and JSONB tags with defaults and supporting indexes.
- `src/db/migrations/0034_orange_black_tom.sql` — additive/idempotent Media migration for category, tags, and indexes.
- `src/db/migrations/meta/0034_snapshot.json` and `src/db/migrations/meta/_journal.json` — record the generated Drizzle migration.
- `src/modules/media/media.validation.ts` and `src/modules/media/media.types.ts` — validate upload metadata, list filters, pagination, UUIDs, and updates.
- `src/modules/media/media.controller.ts` — verifies file magic bytes, applies image/PDF/video size limits, parses metadata, and adds asset detail/update handlers.
- `src/modules/media/media.service.ts` — standardizes upload/list/detail/update responses and protects referenced assets from deletion.
- `src/modules/media/media.repository.ts` — adds SQL-side pagination/filtering and reference checks across placements, Events, Announcements, Website data, and Bible Study JSON fields.
- `src/modules/media/media.routes.ts` — adds `GET /assets/:id` and `PATCH /assets/:id`.
- `src/modules/media/providers/mediaProvider.interface.ts` and `src/modules/media/providers/cloudinaryMediaProvider.ts` — pass the verified resource type through Cloudinary upload and deletion.
- `src/errors/appError.ts` — allows structured conflict details for `MEDIA_ASSET_IN_USE`.

### Database change

Generated with:

```text
npx drizzle-kit generate
```

The generated SQL was reviewed and made additive/idempotent before application. It was applied with:

```text
npm run db:migrate
[✓] migrations applied successfully!
```

Live PostgreSQL metadata verification confirmed:

- `category` is `varchar`, non-null, and defaults to `General`.
- `tags` is `jsonb`, non-null, and defaults to `[]`.
- `idx_media_assets_category` exists.
- `idx_media_assets_resource_type` exists.

### Endpoint and validation behavior

- Uploads accept verified images, videos, and PDFs only; declared MIME types are not trusted.
- Image uploads are limited to 10 MB, PDFs to 20 MB, and videos to 95 MB, below the current Cloudinary Free-plan 100 MB video limit.
- `GET /api/media/assets` supports pagination, search, category, tag, and resource-type filters and returns total/page/limit metadata.
- `GET /api/media/assets/:id` and `PATCH /api/media/assets/:id` provide detail and metadata editing.
- Upload, list, detail, and update responses use the same normalized asset fields.
- Deletion returns `MEDIA_ASSET_IN_USE` with reference-source details when an asset is used by any supported placement or content record.
- Cloudinary operations now use the stored `image`, `video`, or `raw` resource type.

### Real TypeScript and test output

TypeScript:

```text
npx tsc --noEmit
Process exited with code 0
No TypeScript diagnostics were emitted.
```

Media integration suite:

```text
npx vitest run tests/media.test.ts --reporter verbose
Test Files  1 passed (1)
Tests       7 passed (7)
```

The existing non-fatal Vite CommonJS/ESM configuration warning was emitted. The suite exercised authenticated setup, public placement reads, protected asset operations, assignment, and deletion behavior against the configured shared database.

### Task 3 commit

Task 3 was committed locally, with no push:

```text
63b1fee Media: support verified assets and protected lifecycle
```

## Task 4 — Bible Study — 2026-11-13

### Files created and modified

- `src/db/schema/bibleStudy.ts` — persists structured scripture references and an optional retained outline PDF asset.
- `src/db/migrations/0035_ordinary_sphinx.sql` — additive/idempotent migration adding `scripture_references` and `outline_asset_id`, including the media foreign key.
- `src/db/migrations/meta/0035_snapshot.json` and `src/db/migrations/meta/_journal.json` — record the generated Drizzle migration.
- `src/modules/bible-study/bibleStudy.validation.ts` — validates structured scripture references, optional outline assets, and paginated/status-filtered list queries.
- `src/modules/bible-study/bibleStudy.repository.ts` — adds SQL pagination/counts and status transitions.
- `src/modules/bible-study/bibleStudy.service.ts` — adds unpublish and archive lifecycle operations.
- `src/modules/bible-study/bibleStudy.controller.ts` — retains uploaded PDFs through the Media provider, returns the retained asset URL/metadata, and exposes pagination and lifecycle handlers.
- `src/modules/bible-study/bibleStudy.routes.ts` — adds `PATCH /:id/unpublish` and `PATCH /:id/archive`.
- `src/modules/media/media.service.ts` — derives a valid fallback format for raw provider uploads whose response omits a format, fixing PDF asset persistence.

### Database change and live verification

Applied with:

```text
npm run db:migrate
[✓] migrations applied successfully!
```

Live PostgreSQL metadata query returned:

```json
[
  { "column_name": "outline_asset_id", "data_type": "uuid" },
  { "column_name": "scripture_references", "data_type": "jsonb" }
]
```

### Endpoint behavior

- `GET /api/bible-study` now applies SQL-side page/limit/status filtering and returns pagination metadata while preserving the existing array data shape.
- PDF outline uploads still extract structured lessons and scripture references, and now also retain the verified PDF through Cloudinary as a raw Media asset with a downloadable URL.
- Create/update payloads support structured `scriptureReferences` and `outlineAssetId`.
- Public members see published lessons only; Publicity can filter and inspect draft/archived lessons.
- Publicity can publish drafts, unpublish published lessons back to draft, and archive non-archived lessons.
- Existing current-study behavior remains unchanged and continues to select the scheduled published lesson.

### Real TypeScript and test output

TypeScript:

```text
npx tsc --noEmit
Process exited with code 0
No TypeScript diagnostics were emitted.
```

Bible Study:

```text
npx vitest run tests/bibleStudy.test.ts --reporter verbose
Test Files  1 passed (1)
Tests       8 passed (8)
```

Related theme/media regression:

```text
npx vitest run tests/bibleStudyThemeMedia.test.ts --reporter verbose
Test Files  1 passed (1)
Tests       7 passed (7)
```

The first Bible Study run exposed and fixed a raw-PDF `format` nullability bug in the shared Media mapping; the rerun passed all tests.

### Task 4 commit

Task 4 was committed locally, with no push:

```text
a8e0075 Bible Study: retain outlines and add lifecycle pagination
```

## Task 5 — Website CMS / themes — 2026-11-13

### Status

**Task 5 was NOT done.** No CMS themes, `themeId`, publish history or rollback were implemented. Section types were not cleanly validated, and save and publish were not made atomic.

The earlier `cms.test.ts` run was against the live production website, not a test database; its published version number rose with each run. It is not valid clean validation and must not be repeated against production.

Task 5 is blocked until a test database exists.

## Task 6 — Final regression — 2026-11-13

The final sequential regression covered Events, Announcements, Media, Bible Study, Bible Study theme media, Website CMS, and RBAC:

```text
npx vitest run tests/events.test.ts tests/announcements.test.ts tests/media.test.ts tests/bibleStudy.test.ts tests/bibleStudyThemeMedia.test.ts tests/cms.test.ts tests/rbac.test.ts --reporter verbose
Test Files  7 passed (7)
Tests       78 passed (78)
```

The final TypeScript check also passed with no diagnostics. No source changes were required for the dashboard verification phase; existing dashboard access remains governed by the established office/dashboard authorization middleware.

### Scheduler limitation

The announcement scheduler runs its existing `node-cron` job every minute, but the Render free web service sleeps when idle. Therefore the job only runs while the app is awake; scheduler behavior was not changed in this round.

## Task A — Bible Study extractor — 2026-11-14

### Changes

- Added `studyHeading`, `aims`, and `foodForThought` to extracted outlines and persisted Bible Study records.
- Added `Aims` and `MEMORY VERSE TO LEARN` aliases; moved `Food for Thought` out of `studyGuide`.
- Wrapped list lines now merge into their preceding item.
- Memory verse references and text are split cleanly, with `---` removed.
- Relative references such as `with 17:7-8` resolve against the preceding book; unknown references such as `Xzq 9:3` remain flagged.
- Added focused fixture assertions covering all requested counts and fields.

### Migration

Migration file: `src/db/migrations/0036_tearful_justin_hammer.sql`

Command and raw output:

```text
npm run db:migrate
...
[✓] migrations applied successfully!
```

The command was run twice; the second run also completed with `[✓] migrations applied successfully!`, confirming the migration is idempotent.

### Verification

```text
npx vitest run tests/pdfOutlineExtractor.test.ts --reporter verbose
...
 ✓ tests/pdfOutlineExtractor.test.ts > Bible Study outline extraction > extracts every required field from the sample outline 483ms

 Test Files  1 passed (1)
 Tests  1 passed (1)
```

```text
npx tsc --noEmit
Process exited with code 0
```

### Commit

Task A is ready to commit after this report update.

## Task B — Publicity summary — 2026-11-14

### Changes

- Added `GET /api/publicity/summary`.
- Restricted the endpoint to authenticated users with the `publicity-coordinator` office.
- Returned real grouped counts for announcements, programs, and Bible Studies, plus the total media-asset count.
- Reused the existing indexed status columns (`idx_announcements_status`, `idx_events_status`, and `idx_bible_studies_status`); no per-row application-side counting or fabricated metrics were added.

### Verification

```text
npx vitest run tests/publicitySummary.test.ts --reporter verbose
...
 ✓ tests/publicitySummary.test.ts > Publicity summary > allows only the Publicity office and returns database counts 17968ms

 Test Files  1 passed (1)
 Tests  1 passed (1)
```

The test verified a plain member receives `403`, while the Publicity office receives `200` with numeric database-derived count objects.

```text
npx tsc --noEmit
Process exited with code 0
```

### Commit

Task B is committed locally:

```text
28c2a9d Add Publicity summary endpoint
```

## Task C — Missing media and Bible Study tests — 2026-11-14

### Changes

- Added integration coverage for raw PDF media uploads, `PATCH`, `GET /assets/:id`, document/category/tag filters, and pagination metadata.
- Added `MEDIA_ASSET_IN_USE` coverage for media placements, events, announcement image and attachment fields, website configuration copy, website section image/JSON fields, and Bible Study records.
- Added Bible Study coverage for archive, unpublish, Publicity-only unpublished status filters, pagination metadata, saved scripture references, and `outlineAssetId`.
- Fixed the media reference detector to include `bible_studies.outline_asset_id` and the new outline fields.
- Fixed non-Publicity Bible Study requests for unpublished status filters to return an explicit `403 PUBLICITY_ACCESS_REQUIRED`.

### Verification

```text
npx vitest run tests/taskC.coverage.test.ts --reporter verbose
...
 ✓ tests/taskC.coverage.test.ts > Task C coverage > sets up a Publicity user and member 8188ms
 ✓ tests/taskC.coverage.test.ts > Task C coverage > covers raw PDF media, PATCH, GET, filters, and pagination 9958ms
 ✓ tests/taskC.coverage.test.ts > Task C coverage > reports MEDIA_ASSET_IN_USE for every referencing table 14749ms
 ✓ tests/taskC.coverage.test.ts > Task C coverage > covers Bible Study lifecycle, pagination, status access, scripture references, and outlineAssetId 17505ms

 Test Files  1 passed (1)
 Tests  4 passed (4)
```

```text
npx tsc --noEmit
Process exited with code 0
```

### Commit

Task C implementation and coverage commit:

```text
cd8f5f0 Add media and Bible Study coverage
```

## Task D — Published program edits — 2026-11-14

### Changes

- `PUT /api/events/:id` now permits edits while a program is Published.
- Cancelled programs remain non-editable and return `409 CANCELLED_NOT_EDITABLE`.
- Updated the lifecycle assertions to cover both behaviors.

### Verification

```text
npx vitest run tests/events.test.ts --reporter verbose
...
 Test Files  1 passed (1)
 Tests  12 passed (12)
```

```text
npx tsc --noEmit
Process exited with code 0
```

### Commit

Task D implementation commit:

```text
6e93632 Allow edits to published programs
```

## Task E — Tasks 1–4 migration verification — 2026-11-14

### Migration ritual

Command:

```text
npm run db:migrate
...
[✓] migrations applied successfully!
```

### Raw query output

```text
Task 1 events columns
[{"column_name":"image_asset_id","data_type":"uuid","column_default":null,"is_nullable":"YES"}]
Task 1 events constraint
[{"constraint_name":"chk_events_status","check_clause":"((status)::text = ANY ((ARRAY['Draft'::character varying, 'Active'::character varying, 'Cancelled'::character varying])::text[]))"}]
Task 1 events index
[{"indexname":"idx_events_status_start_time"}]
Task 2 announcements columns
[{"column_name":"attachment_asset_ids","data_type":"jsonb","column_default":"'[]'::jsonb","is_nullable":"NO"},{"column_name":"audience","data_type":"jsonb","column_default":"'{\"gender\": [], \"levels\": [], \"subgroups\": []}'::jsonb","is_nullable":"NO"},{"column_name":"category","data_type":"character varying","column_default":"'General'::character varying","is_nullable":"NO"},{"column_name":"image_asset_id","data_type":"uuid","column_default":null,"is_nullable":"YES"},{"column_name":"publish_at","data_type":"timestamp with time zone","column_default":null,"is_nullable":"YES"}]
Task 2 announcements constraints
[{"constraint_name":"chk_announcements_category","check_clause":"((category)::text = ANY ((ARRAY['General'::character varying, 'Prayer'::character varying, 'Event'::character varying, 'Academic'::character varying, 'Urgent'::character varying, 'Other'::character varying])::text[]))"},{"constraint_name":"chk_announcements_status","check_clause":"((status)::text = ANY ((ARRAY['Draft'::character varying, 'Scheduled'::character varying, 'Pending Review'::character varying, 'Revision Requested'::character varying, 'Approved'::character varying, 'Published'::character varying, 'Archived'::character varying])::text[]))"}]
Task 2 announcements indexes
[{"indexname":"idx_announcements_audience"},{"indexname":"idx_announcements_category"},{"indexname":"idx_announcements_publish_at"}]
Task 3 media columns
[{"column_name":"category","data_type":"character varying","column_default":"'General'::character varying","is_nullable":"NO"},{"column_name":"tags","data_type":"jsonb","column_default":"'[]'::jsonb","is_nullable":"NO"}]
Task 3 media indexes
[{"indexname":"idx_media_assets_category"},{"indexname":"idx_media_assets_resource_type"}]
Task 4 Bible Study columns
[{"column_name":"aims","data_type":"jsonb","column_default":"'[]'::jsonb","is_nullable":"NO"},{"column_name":"food_for_thought","data_type":"text","column_default":null,"is_nullable":"YES"},{"column_name":"outline_asset_id","data_type":"uuid","column_default":null,"is_nullable":"YES"},{"column_name":"scripture_references","data_type":"jsonb","column_default":"'[]'::jsonb","is_nullable":"NO"},{"column_name":"study_heading","data_type":"character varying","column_default":null,"is_nullable":"YES"}]
Task 4 Bible Study foreign key
[{"constraint_name":"bible_studies_outline_asset_id_media_assets_id_fk","table_name":"bible_studies","foreign_table_name":"media_assets"}]
```

### Task F — Separate regression output — 2026-11-14

Each command was run separately with `--reporter verbose`. The first pass encountered transient Neon DNS resolution failures in `handover.test.ts`, `fsClasses.test.ts`, and `fsFinalize.test.ts`; each was rerun separately and passed. Raw final result output:

```text
===== npx vitest run tests/members.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests  10 passed (10)
===== npx vitest run tests/passwordChange.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests  6 passed (6)
===== npx vitest run tests/publicityAccess.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests  8 passed (8)
===== npx vitest run tests/president.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests  5 passed (5)
===== npx vitest run tests/governance.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests  7 passed (7)
===== npx vitest run tests/auth.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests  11 passed (11)
===== npx vitest run tests/authorization.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests  1 passed (1)
===== npx vitest run tests/handover.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests  9 passed (9)
===== npx vitest run tests/officeAccess.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests  3 passed (3)
===== npx vitest run tests/rbac.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests 12 passed (12)
===== npx vitest run tests/users.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests 8 passed (8)
===== npx vitest run tests/subgroups.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests 2 passed (2)
===== npx vitest run tests/fs.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests 18 passed (18)
===== npx vitest run tests/fsAdmissions.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests 7 passed (7)
===== npx vitest run tests/fsClasses.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests 7 passed (7)
===== npx vitest run tests/fsFinalize.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests 11 passed (11)
===== npx vitest run tests/fsManual.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests 7 passed (7)
===== npx vitest run tests/fsSessions.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests 4 passed (4)
===== npx vitest run tests/fsStudents.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests 8 passed (8)
===== npx vitest run tests/fsTeachers.test.ts --reporter verbose =====
 Test Files  1 passed (1)
      Tests 8 passed (8)
```

Final regression total: **20 files passed, 152 tests passed**.

Task 5 was not started. `tests/cms.test.ts` was not run.

### Commit status

Task D source is already committed in `6e93632`. Tasks E and F verification are recorded above; this report update remains uncommitted.

## Round 3 — R3-2 extractor assertions — 2026-11-16

Updated `tests/pdfOutlineExtractor.test.ts` to assert every study's guide counts and first words, aims counts, food-for-thought presence, all memory verse references and clean text, study 5 prayer points, and the unrecognised `Xzq 9:3` reference. The food-for-thought comparison is whitespace-insensitive.

Raw verbose output:

```text
npx vitest run tests/pdfOutlineExtractor.test.ts --reporter verbose
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set VITE_CONFIG_NATIVE_IGNORE_WARNING=true to suppress this warning.

 RUN  v5.0.1 C:/Users/HP/OneDrive/Documents/Asf app/asf-backend

 ✓ tests/pdfOutlineExtractor.test.ts > Bible Study outline extraction > extracts every required field from the sample outline 357ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  09:03:05
   Duration 1.67s (import 64%, tests 29%, transform 5%, worker 2%)
```

## Round 3 — R3-3 real upload assertions — 2026-11-16

Extended the real `POST /api/bible-study/upload-outline` test to assert five extracted studies, guide and aims counts, headings, food-for-thought presence, all clean memory verses, and the unrecognised `Xzq 9:3` reference. The live alias tables produced the expected result, so no alias or extractor change was needed.

Raw verbose output:

```text
npx vitest run tests/bibleStudy.test.ts --reporter verbose
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set VITE_CONFIG_NATIVE_IGNORE_WARNING=true to suppress this warning.

 RUN  v5.0.1 C:/Users/HP/OneDrive/Documents/Asf app/asf-backend

--- Admin -> upload real PDF outline ---
Status: 200
    "studiesFound": 5,
              "raw": "Xzq 9:3",
              "recognized": false

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration 30.80s
```

## Round 3 — R3-4 Bible Study field persistence — 2026-11-16

Confirmed that `POST /api/bible-study` and `POST /api/bible-study/series` accept and persist `studyHeading`, `aims`, and `foodForThought`. Integration assertions cover create responses, `GET /api/bible-study`, `GET /api/bible-study/:id`, and series reads. No implementation change was needed.

Raw verbose output:

```text
npx vitest run tests/bibleStudy.test.ts tests/bibleStudySeries.test.ts --reporter verbose
 RUN  v5.0.1 C:/Users/HP/OneDrive/Documents/Asf app/asf-backend

 ✓ tests/bibleStudySeries.test.ts > Bible Study Series > Admin creates a real 3-lesson series: dates match the generator, title falls back to topic when omitted 2205ms
 ✓ tests/bibleStudy.test.ts > Bible Study > Creates a lesson and reads back studyHeading, aims, and foodForThought 4800ms

 Test Files  2 passed (2)
      Tests  20 passed | 1 skipped (21)
   Duration 70.34s
```

## Round 3 — R3-5 Publicity summary — 2026-11-16

Expanded `GET /api/publicity/summary` with upcoming active programs, recent Publicity-relevant audit entries joined to actor names, pending/revision announcement counts, and media counts for image, video, and raw resources. All eight summary reads run in one `Promise.all` batch; no per-row queries are used. Existing count fields remain unchanged, and the endpoint test now checks field shapes, ordering, status-count consistency, and media-count consistency.

`EXPLAIN (COSTS OFF)` output for the four new query shapes:

```text
upcoming
[
  'Limit',
  '  ->  Sort',
  '        Sort Key: start_time',
  '        ->  Seq Scan on events',
  "              Filter: (((status)::text = 'Active'::text) AND (start_time >= now()))"
]
audit
[
  'Limit',
  '  ->  Sort',
  '        Sort Key: al.created_at DESC',
  '        ->  Nested Loop',
  '              ->  Index Scan using idx_audit_logs_target on audit_logs al',
  "                    Index Cond: ((target_type)::text = ANY ('{event,announcement,media_asset,bible_study,website}'::text[]))",
  '              ->  Index Scan using users_pkey on users u',
  '                    Index Cond: (id = al.actor_id)'
]
awaiting
[
  'HashAggregate',
  '  Group Key: status',
  '  ->  Seq Scan on announcements',
  `        Filter: ((status)::text = ANY ('{"Pending Review","Revision Requested"}'::text[]))`
]
media
[
  'HashAggregate',
  '  Group Key: resource_type',
  '  ->  Seq Scan on media_assets'
]
```

The current database tables are small, so PostgreSQL chose sequential scans for the aggregate queries and the upcoming-program query despite the existing status/resource-type indexes; the audit query used `idx_audit_logs_target` and `users_pkey`. R3-8 repeats these plans at a 500-row scale before deciding whether a verified migration is needed.

## Round 3 — R3-6 announcement scheduler limitation — 2026-11-16

No scheduler behavior was changed. The existing `node-cron` job still runs every minute, but the Render free web service sleeps when idle, so the job runs only while the app is awake.

## Round 3 — R3-8 query and index review — 2026-11-16

Used temporary scratch tables with **5,000 rows per domain** (programs, targeted announcements, media assets, and Bible Studies), `ANALYZE`, and the same filtering/order shapes as the main list queries. The scratch tables and rows were connection-local and were discarded when the connection closed. No migration was added because the verified plans used the existing index patterns.

Raw `EXPLAIN (COSTS OFF)` output:

```text
programs
[
  'Limit',
  '  ->  Sort',
  '        Sort Key: start_time',
  '        ->  Bitmap Heap Scan on scratch_events e',
  "              Recheck Cond: ((status = ANY ('{Active,Cancelled}'::text[])) AND (start_time >= now()))",
  '              ->  Bitmap Index Scan on scratch_events_status_start',
  "                    Index Cond: ((status = ANY ('{Active,Cancelled}'::text[])) AND (start_time >= now()))"
]
announcements
[
  'Limit',
  '  ->  Sort',
  '        Sort Key: a.created_at DESC',
  '        ->  Nested Loop Left Join',
  '              ->  Bitmap Heap Scan on scratch_announcements a',
  "                    Recheck Cond: (status = 'Published'::text)",
  '                    ->  Bitmap Index Scan on scratch_announcements_status',
  "                          Index Cond: (status = 'Published'::text)",
  '              ->  Materialize',
  '                    ->  Seq Scan on scratch_users u'
]
media
[
  'Limit',
  '  ->  Index Scan using scratch_media_created on scratch_media'
]
bibleStudy
[
  'Limit',
  '  ->  Index Scan using scratch_bible_date on scratch_bible',
  "        Filter: (publication_status = 'published'::text)"
]
```

The only sequential scan is the one-row scratch viewer table used for announcement targeting; it is expected and not an application list-table scan. No application sequential scan needed an additional verified index.

## Round 3 — R3-7 Cloudinary upload limits — 2026-11-16

Cloudinary's current plan comparison lists the Free-plan maximums as:

- Image: **10 MB**
- Video: **100 MB**
- Raw files, including PDFs: **10 MB**

Source: [Cloudinary Compare Plans](https://cloudinary.com/pricing/compare-plans).

Our limits were 10 MB for images, 95 MB for video, and 20 MB for raw/PDF files. The raw/PDF limit exceeded Cloudinary's verified 10 MB Free-plan maximum, so `MAX_DOCUMENT_BYTES` in `src/modules/media/media.controller.ts` was reduced to 10 MB. Image and video limits remain within the documented limits. The separate Multer ceiling remains 95 MB to preserve the existing video ceiling; resource-specific validation rejects raw files above 10 MB before provider upload.

Validation:

```text
npx vitest run tests/media.test.ts --reporter verbose
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration 29.45s
```
