# ASF R4 Report

## Test environment

- Test branch: `asf branch`
- Test host: `ep-damp-rain-ayucoeg7-pooler.c-5.us-east-2.aws.neon.tech`
- Database: `asf_futa`
- The test branch was reset from production parent `production` before migration work.
- No production database was changed.

## R4-1 Shared CMS

- Migration: `0037_aspiring_leper_queen.sql`
- Raw `website_configurations` rows: one `draft`, one `published`.
- Raw `website_settings`: `id=1`, `active_theme_id=classic-auditoria`.
- Raw `information_schema` verification found no `website_configurations.theme_id`.
- Raw unique index: `uq_website_config_status`.
- Theme registry names:
  - `classic-auditoria`: Classic Auditoria
  - `picture-dominant`: Picture-Dominant
  - `editorial`: Editorial
- CMS routes exist for both legacy `/website/...` paths and the shared `/draft`, `/publish`, `/reset`, `/history`, `/restore`, `/activate` paths.
- Raw Vitest: `1 Test Files passed`, `21 Tests passed`.
- Build: `dist/server.cjs` generated successfully.

## R4-2 Mission, Vision, Values

- Stored under shared `website_configurations.copy`.
- Validation limits:
  - mission: 1000 characters
  - vision: 1000 characters
  - values: maximum 12
  - value title: 80 characters
  - value description: 300 characters
- Raw Vitest: `1 Test Files passed`, `3 Tests passed`.

## R4-3 Gallery

- Gallery items require `imageAssetId`, `caption <= 200`, and `altText <= 200`.
- Public reads resolve `imageAssetId` to `imageUrl`.
- Media deletion reports `409 MEDIA_ASSET_IN_USE` for references in CMS section items and publish-history snapshots.
- Raw Vitest: `1 Test Files passed`, `2 Tests passed`.

## R4-4 Public endpoints

- Migration: `0038_sour_dragon_lord.sql`.
- Raw `information_schema`: `is_public` is `boolean`, `NOT NULL`, default `false`.
- Create and update announcement schemas accept `isPublic`.
- Public programs include only `Active` events.
- Public announcements include only `Published`, public, unrestricted and unexpired announcements.
- Public responses set `Cache-Control: public, max-age=60`.
- Public list endpoints cap `limit` at 50 and return list `meta`.
- Drafts, targeted/non-public announcements, attachments, authors and internal fields are excluded.
- Raw Vitest: `1 Test Files passed`, `3 Tests passed`.

## R4-5 Cloudinary transformations

- Source URL:
  - `https://res.cloudinary.com/chnickbm/image/upload/v1794817898/asf/media/uuqbdxnqspclhkjt0cvr.jpg`
- Transformed URL:
  - `https://res.cloudinary.com/chnickbm/image/upload/w_800,f_auto,q_auto/v1794817898/asf/media/uuqbdxnqspclhkjt0cvr.jpg`
- Raw source status: `200`
- Raw source content type: `image/jpeg`
- Raw transformed status: `200`
- Raw transformed content type: `image/jpeg`
- Live account plan: `Free`
- Credit limit: `25`
- Credit usage: `5.22`
- Usage percentage: `20.88%`
- Bandwidth: `5452882333` bytes (`5.08` credits)
- Storage: `140046531` bytes (`0.13` credits)
- Transformations: `12` (`0.01` credits)
- No code was changed for R4-5.

## R4-6 Mail delivery

- The only registered production adapter is `ConsoleMailerAdapter` in `src/adapters/mailer/index.ts`.
- It does not send real email; it logs the recipient, name, purpose and magic-link URL.
- Environment variables used or declared:
  - `DATABASE_URL`
  - `APP_BASE_URL`
  - `FRONTEND_URL`
  - `MAIL_FROM_ADDRESS`
  - `MAILER_API_KEY`
  - `COOKIE_SECRET`
- `MAILER_API_KEY` is declared but unused by `ConsoleMailerAdapter`.
- Registration creates the user and registration token/session context, then calls `sendMagicLinkEmail(..., purpose="register")`; with the console adapter the link is only logged.
- Magic-link login invalidates prior unconsumed tokens, creates an expiring token, and calls `sendMagicLinkEmail(..., purpose="login")`.
- Unknown emails receive the same generic response and no link is sent.
- No code was changed for R4-6.

## R4-7 Production migration plan

- Written at `docs/CMS_PRODUCTION_MIGRATION_PLAN.md`.
- It documents the checkpoint branch, JSON exports, exact additive SQL, raw verification queries, migrate-first deploy order and rollback.

## R4-8 Postman collection

- Written at `docs/asf-postman-collection.json`.
- Includes Programs, Announcements, CMS config, media assets, media placements and public endpoints.
- Requests mark test source environment and include auth requirements and representative success/error responses.

## R4-9 Per-file regression

`academicProgression.test.ts` was excluded. The first loop ran files individually. `taskC.coverage.test.ts` and `users.test.ts` had Neon connection-timeout failures in that loop; both passed on immediate individual retry.

| Test file | Raw result |
|---|---|
| academicSessions.test.ts | 1 passed, 8 passed |
| announcements.test.ts | 1 passed, 17 passed |
| auth.test.ts | 1 passed, 11 passed |
| authorization.test.ts | 1 passed, 1 passed |
| bible.test.ts | 1 passed, 11 passed |
| bibleStudy.test.ts | 1 passed, 9 passed |
| bibleStudySchedule.test.ts | 1 passed, 8 passed |
| bibleStudySeries.test.ts | 1 passed, 11 passed, 1 skipped |
| bibleStudyThemeMedia.test.ts | 1 passed, 7 passed |
| cms.test.ts | 1 passed, 21 passed |
| cmsGallery.test.ts | 1 passed, 2 passed |
| cmsMissionVisionValues.test.ts | 1 passed, 3 passed |
| events.test.ts | 1 passed, 12 passed |
| fs.test.ts | 1 passed, 18 passed |
| fsAdmissions.test.ts | 1 passed, 7 passed |
| fsClasses.test.ts | 1 passed, 7 passed |
| fsFinalize.test.ts | 1 passed, 11 passed |
| fsManual.test.ts | 1 passed, 7 passed |
| fsSessions.test.ts | 1 passed, 4 passed |
| fsStudents.test.ts | 1 passed, 8 passed |
| fsTeachers.test.ts | 1 passed, 8 passed |
| governance.test.ts | 1 passed, 7 passed |
| handover.test.ts | 1 passed, 9 passed |
| media.test.ts | 1 passed, 7 passed |
| members.test.ts | 1 passed, 10 passed |
| officeAccess.test.ts | 1 passed, 3 passed |
| passwordChange.test.ts | 1 passed, 6 passed |
| pdfOutlineExtractor.test.ts | 1 passed, 1 passed |
| phaseA.test.ts | 1 passed, 1 passed |
| president.test.ts | 1 passed, 5 passed |
| publicEndpoints.test.ts | 1 passed, 3 passed |
| publicityAccess.test.ts | 1 passed, 8 passed |
| publicitySummary.test.ts | 1 passed, 1 passed |
| rbac.test.ts | 1 passed, 12 passed |
| subgroups.test.ts | 1 passed, 2 passed |
| taskC.coverage.test.ts | First loop: 1 failed, 4 failed; retry: 1 passed, 4 passed |
| users.test.ts | First loop: 1 failed, 7 failed, 1 passed; retry: 1 passed, 8 passed |
