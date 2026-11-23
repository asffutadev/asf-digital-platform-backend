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

