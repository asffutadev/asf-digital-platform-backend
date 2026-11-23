# ASF R4 Report

## R4-5 Cloudinary transformations

- Source image URL: `https://res.cloudinary.com/chnickbm/image/upload/v1794817898/asf/media/uuqbdxnqspclhkjt0cvr.jpg`
- Transformed URL: `https://res.cloudinary.com/chnickbm/image/upload/w_800,f_auto,q_auto/v1794817898/asf/media/uuqbdxnqspclhkjt0cvr.jpg`
- Raw status: `200`
- Raw content type: `image/jpeg`
- Live plan: `Free`
- Live credit limit: `25`
- Live credit usage: `5.22` (`20.88%`)
- Bandwidth usage: `5452882333` bytes (`5.08` credits)
- Storage usage: `140046531` bytes (`0.13` credits)
- Transformation usage: `12` (`0.01` credits)

## R4-6 Mail delivery

- Production adapter: `ConsoleMailerAdapter` is the only registered adapter in [src/adapters/mailer/index.ts](/C:/Users/HP/OneDrive/Documents/Asf app/asf-backend/src/adapters/mailer/index.ts).
- It does not send real email. [consoleMailerAdapter.ts](/C:/Users/HP/OneDrive/Documents/Asf app/asf-backend/src/adapters/mailer/consoleMailerAdapter.ts) only logs recipient, name, purpose and link to server output.
- Required environment variables:
  - `MAIL_FROM_ADDRESS`
  - `MAILER_API_KEY` (declared but not used by the console adapter)
  - `APP_BASE_URL`
  - `FRONTEND_URL`
  - `DATABASE_URL`
  - `COOKIE_SECRET`
- Registration:
  - Creates the user, default role/session context and membership records in the auth service.
  - Sends a magic-link email for purpose `register` only through the registered mailer.
  - With the console adapter, the registration link is printed to logs rather than delivered.
- Magic-link request:
  - Invalidates prior unconsumed tokens, creates a one-hour-style expiring token according to app configuration, and calls `sendMagicLinkEmail` for purpose `login`.
  - Unknown emails deliberately receive the same generic success response and no link is sent.
  - The console adapter prints no real delivery.

  ## R4-1 Shared CMS

  - Test host: `ep-damp-rain-ayucoeg7-pooler.c-5.us-east-2.aws.neon.tech`
  - Raw row counts:
    - `draft`: `1`
    - `published`: `1`
  - Raw active theme: `classic-auditoria`
  - Raw config columns: no `theme_id`
  - Raw unique index: `uq_website_config_status`
  - Build: `dist/server.cjs` generated successfully

  ## R4-2 Mission, Vision, Values

  - Raw Vitest result: `1 Test Files passed (1)`
  - Raw Vitest result: `3 Tests passed (3)`

  ## R4-3 Gallery

  - Raw Vitest result: `1 Test Files passed (1)`
  - Raw Vitest result: `2 Tests passed (2)`
  - Asset deletion returned `409 MEDIA_ASSET_IN_USE`.

  ## R4-4 Public endpoints

  - Raw `is_public` verification:
    - data type: `boolean`
    - default: `false`
    - nullable: `NO`
  - Raw Vitest result: `1 Test Files passed (1)`
  - Raw Vitest result: `3 Tests passed (3)`

  ## R4-9 Per-file regression counts

  `academicProgression.test.ts` was excluded.

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
  | cms.test.ts | First loop: 1 failed, 3 failed \| 18 passed (21); rerun: 1 passed, 21 passed |
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
  | taskC.coverage.test.ts | 1 passed, 4 passed |
  | users.test.ts | 1 passed, 8 passed |

