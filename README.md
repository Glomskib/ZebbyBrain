# Zebby's World

A supportive chronic illness companion built for the EDS / POTS / rare condition
community. Track symptoms, see patterns, talk to Zebby, prep for doctor visits,
and find soft places to land on the hard days.

## Quick start (local)

```bash
git clone https://github.com/Glomskib/ZebbyBrain.git zebbys-world
cd zebbys-world
npm install
cp .env.example .env    # any blanks are fine for local dev
npm run dev
```

Open **http://localhost:5000**.

There is no test account — sign up with any email and password (8+ chars).
The local database is an embedded PGlite store at `.data/pglite/` and is
created automatically on first boot. Wipe it with `rm -rf .data/pglite` to
start fresh.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite + Express dev server on port 5000 with hot reload |
| `npm run build` | Build the client (`dist/public`) and bundle the server (`dist/index.js`) |
| `npm run start` | Run the production bundle (set `SESSION_SECRET` first; see below) |
| `npm run check` | TypeScript strict check (legacy errors are non-blocking; the build is what matters) |
| `npx playwright test e2e/tests/smoke.spec.ts` | Browser smoke (launches Chromium against your running dev server) |
| `npx playwright test e2e/tests/tracker.spec.ts` | Browser test for the symptom logger flow |

## Production build, locally

```bash
npm run build
NODE_ENV=production \
SESSION_INSECURE=true \
DATABASE_URL=pglite://.data/pglite-prod \
SESSION_SECRET="some-secret-with-32-or-more-chars-please" \
PORT=5001 \
node dist/index.js
```

`SESSION_INSECURE=true` is only for local-HTTP smokes — drop it on a real
HTTPS deploy so cookies stay `Secure`.

## Environment variables

All blanks are fine for local dev — Zebby gracefully falls back. See
`.env.example` for the full list. Must-have for production:

- `SESSION_SECRET` (32+ chars) — required for production session signing
- `DATABASE_URL` — Postgres connection string (Neon serverless or
  `pglite://path` for embedded). Defaults to PGlite if unset.
- `STRIPE_WEBHOOK_SECRET` — required in production if Stripe is enabled

Optional integrations (each is unlocked when its keys appear):

- `OPENAI_API_KEY` — turns on real Ask Zebby + RAG embeddings; without
  it, Zebby returns warm canned replies labelled "offline reply".
- `STRIPE_SECRET_KEY` + `STRIPE_PLUS_PRICE_ID` — enables real Zebby+
  checkout instead of the placeholder upgrade flow.
- `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`
  — enables Capacitor mobile push auth. Optional even on prod web.
- `OPENWEATHER_API_KEY` — enables weather context on symptom logs.
- `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_STOREFRONT_TOKEN` — turns the
  Pouch into a live storefront.

## Folder map

```
client/src
  pages/                feature pages (auth, dashboard, tracker, history, …)
  pages/expansions/     calm corner, sounds, trail, herd insights, doctor prep
  components/           UI components (shadcn/ui + custom)
  components/shell/     AppShell, Gate, MobileBottomNav
  hooks/                useAuth, useProfile, …
server
  index.ts              Express + Vite middleware boot
  routes.ts             core API routes
  routes/               feature subrouters (ai, billing, rewards, …)
  bootstrap/            initDb + drizzle-driven schemaSync (idempotent)
  replitAuth.ts         email/password session auth (passport-local)
  db.ts                 dual-mode PGlite / Neon driver
shared/schema.ts        single drizzle schema source of truth
e2e/tests/              Playwright smoke + tracker tests
```

## Routes that exist

Public:
`/`, `/login`, `/signup`, `/auth`

Onboarding-required:
`/onboarding`

Authenticated:
`/dashboard`, `/tracker`, `/symptom-tracker`, `/history`, `/symptom-history`,
`/ask-zebby`, `/zebby-plus`, `/calm-corner`, `/zzzebby-sounds`, `/trusted-trail`,
`/herd-insights`, `/doctor-prep`, `/pastures`, `/spoonies`, `/zebbys-pouch`,
`/rewards`, `/settings`, `/settings/herd-rewards`

## Manual QA

See `TESTING.md` for the full happy-path checklist.

## License

MIT.
