# Security

How Zebby's World protects people's health data, as the code works today.
If something here stops being true, fix the code or fix this file in the same
change.

Last reviewed: October 9, 2026

## Accounts and sessions

- Email + password sign-in (`server/replitAuth.ts`, passport-local). Passwords
  are hashed with bcrypt (cost 12). No plain-text passwords are stored.
- Server-side sessions in Postgres (`connect-pg-simple`), cookie is
  `httpOnly`, `sameSite=lax`, `secure` on HTTPS, 7-day lifetime.
- `SESSION_SECRET` is required in production; the server will not start
  without it.
- The shared-password test login (`ALLOW_TEST_LOGIN`) is for local and staging
  smoke tests only. The server refuses to start in production if it is on.
- Every `/api` route that touches personal data sits behind
  `isAuthenticated` / `requireAuth`, and reads the user id from the session,
  never from the request body. CI fails if billing code reads
  `req.body.userId`.

## Browser and network protections

Set in `server/index.ts`:

- Content Security Policy. Scripts from our own origin and Stripe only.
  `connect-src` allows our API, Stripe, and the Supabase project used for
  private visit audio. **OpenAI is not reachable from the browser**: all AI
  calls happen on the server.
- `Permissions-Policy`: microphone and geolocation for our own pages only;
  camera, USB, serial and Bluetooth off.
- `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy: no-referrer`, HSTS on HTTPS.
- Strict CORS allow-list (`APP_URL` + `ALLOWED_ORIGINS`).
- JSON bodies capped at 512 KB, 10-second request timeouts, HTTP parameter
  pollution protection, and rate limits (60 requests/minute on `/api`,
  tighter on AI routes).

## Logging

- Production request logs contain only method, path, status and timing.
  Response bodies are never logged in production, because they can hold
  health text or short-lived upload links.
- Development logs redact known sensitive keys (notes, email, titles,
  transcripts, recaps, AI replies, URLs).

## AI

- One server-side OpenAI client (`server/lib/aiClient.ts`) for every feature,
  pointed at the dedicated Zebby's World org/project
  (`OPENAI_ORG_ID` / `OPENAI_PROJECT_ID`) that has the OpenAI Healthcare
  Addendum. No real user health audio or transcripts are sent until that
  addendum is signed.
- AI prompts tell Zebby never to diagnose or give medical advice. Without an
  API key, features fall back to clearly labelled offline replies.

## Visit Recorder (Zebby+, behind `FF_VISIT_RECORDER`)

- **Consent.** Users opt in once on a separate screen (not bundled into the
  Terms). Every opt-in and opt-out is logged in `visit_consents` with the
  consent wording version, app version, platform and a hashed IP. Each visit
  stores when the user tapped "Everyone's OK, start recording" and which
  spoken-consent line they were shown. Wording lives in
  `shared/visitConsent.ts`; changing it means bumping the version, which
  asks users to opt in again.
- **Audio storage.** Private Supabase Storage bucket (`visit-audio`), created
  and kept private on boot. The app uploads straight to storage through a
  one-time signed link; there are no public URLs. Only the server holds the
  service-role key. Audio-only file types, 150 MB cap.
- **Audio retention.** An hourly job (`server/lib/visitRetention.ts`) deletes
  audio once the transcript is approved, 30 days after the visit at most, and
  24 hours after an upload that never arrived.
- **Encryption at rest.** Titles, transcripts, recaps and consent evidence
  are encrypted with AES-256-GCM (`server/lib/healthCrypto.ts`) using a
  per-user key derived from `HEALTH_DATA_KEY`, bound to the user and the
  field. A value copied to another user or another column will not decrypt.
  Key rotation is supported through `HEALTH_DATA_KEY_PREVIOUS`. The server
  will not start in production with the feature on and no valid key.
- **Access.** Owner-only. Every create, upload, view and delete, plus every
  automatic audio deletion, is written to `visit_access_log`.

## Your data, your control

- Export: passphrase-encrypted backup download (`/api/account/backup`).
  Visit transcripts and recaps join the backup when the recap step ships.
- Delete account: on by default (App Store requirement). Soft delete with a
  7-day undo, then a nightly purge removes symptom, vitals, sleep, hydration,
  sodium and AI history, all visits (audio and encrypted text), and the
  consent log.
- Per-category data retention settings in Settings.

## Required production secrets

`SESSION_SECRET`, `DATABASE_URL`, `STRIPE_WEBHOOK_SECRET` (if Stripe is on),
and for Visit Recorder: `HEALTH_DATA_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`. Keys are entered in the
host's secret settings by the account owner and never committed.

## Before Visit Recorder goes live

- Health-privacy lawyer reviews the consent wording, privacy policy and
  standalone Consumer Health Data Policy.
- Outside security test of the upload, storage and consent-record path.
- Written breach response plan (FTC Health Breach Notification Rule: notify
  within 60 days).

## Reporting a problem

Email the owner directly. Please don't open a public issue for security
problems.
