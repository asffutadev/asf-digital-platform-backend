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
