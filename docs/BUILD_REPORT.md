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
