# Zebby's World — Testing Guide

A short, manual happy-path QA you can walk on a fresh Mac. Pairs with the
automated browser tests in `e2e/tests/`.

## Setup

```bash
npm install
cp .env.example .env       # blanks are fine for local
npm run dev
```

Open **http://localhost:5000** in Chrome/Safari/Firefox.

If you want a clean slate between runs:
```bash
rm -rf .data/pglite
```

## Automated browser tests

Run these from a second terminal while `npm run dev` is alive:

```bash
npx playwright install chromium      # one-time
npx playwright test e2e/tests/smoke.spec.ts --project=chromium
npx playwright test e2e/tests/tracker.spec.ts --project=chromium
```

Both should pass with **0 console errors** and write screenshots to
`/tmp/zebby-smoke/`.

## Manual checklist

Each box is a discrete acceptance test. Don't skip — they expose the most
common regressions in order of severity.

### 1. Signup
- [ ] Visit `/login` → click **Sign up** tab
- [ ] Fill first name, last name, email (any), password (8+ chars), confirm
- [ ] Click **Create account**
- [ ] Toast: "Welcome to Zebby's World!"
- [ ] URL becomes `/onboarding`
- [ ] No console errors

### 2. Login
- [ ] Click your avatar → **Log out**
- [ ] You land at `/login`
- [ ] Re-enter the email/password from step 1
- [ ] You land back at `/` (dashboard) — **no flash of the Landing page**

### 3. Onboarding
- [ ] Walk all 7 steps; the avatar step shows 6 visually distinct Zebbys
- [ ] Pick **Sparkle Zebby** (or any other variant)
- [ ] Complete setup → URL becomes `/`
- [ ] Dashboard hero greets you by first name
- [ ] Top-left logo + chat-bubble avatars reflect your variant

### 4. Symptom tracker — saves a real entry
- [ ] From dashboard click **Tracker**
- [ ] Click **New entry**
- [ ] Pick at least one symptom card (e.g. Joint Pain)
- [ ] Set intensity slider, optional body part
- [ ] In the Context block: tap a Mood chip, an Activity chip, a Diet chip
- [ ] Click **+500ml** under Water; the "Water · 500ml today" total updates
- [ ] Click **+500mg** under Sodium; the "Sodium · 500mg today" total updates
- [ ] Type a note in "Overall session notes"
- [ ] Click **Log Symptoms**
- [ ] Toast: "Symptom logged successfully"
- [ ] Modal closes; the tracker page now lists your entry

### 5. History fetch
- [ ] Visit `/history`
- [ ] **Entries logged** tile shows a number ≥ 1
- [ ] **Avg intensity** is a number, not "—"
- [ ] **Top symptom** matches what you logged
- [ ] Switch to **Entries** tab — your row shows: intensity badge, symptom name,
      mood/activity/diet badges (😌 / 🏃 / 🥗), timestamp, body part if you set one
- [ ] Switch to **Timeline** — daily-average line chart renders
- [ ] Switch to **By symptom** — bar chart renders

### 6. Ask Zebby — fallback works
- [ ] Visit `/ask-zebby`
- [ ] Banner shows the medical-disclaimer copy
- [ ] Welcome bubble from Zebby is visible
- [ ] Click any quick-prompt chip — Zebby replies
- [ ] If `OPENAI_API_KEY` is unset, the reply has a small "offline reply" label
- [ ] Type a custom message in the textarea, hit Send — get another reply
- [ ] Voice-coming-soon footer is visible

### 7. Rewards page
- [ ] Visit `/rewards` (or click the **Rewards** tile on dashboard)
- [ ] **Reward ladder** shows 5 tiers: Sticker → 10% off Pouch → Electrolyte
      sample → 25% off Pouch → Hoodie
- [ ] Progress bar reflects your point total (likely 0 on a fresh account)
- [ ] **Up next** badge appears on the first locked tier
- [ ] Your **referral link** can be copied; the **Code** is visible

### 8. Zebby+ premium
- [ ] Visit `/zebby-plus`
- [ ] Cards explain the perks
- [ ] **Upgrade to Zebby+** button is visible. If Stripe isn't configured,
      clicking it shows a polite toast — it does **not** crash

### 9. Settings + logout
- [ ] Visit `/settings`
- [ ] **Back to dashboard** link is at the top
- [ ] Profile card shows your name + email + plan badge
- [ ] **Log out** button is on the profile card
- [ ] Preferences card lists Reminders / Language / Subscription / Export
- [ ] Click **Log out** → land on `/login`

### 10. Mobile viewport
Use Chrome DevTools → toggle device toolbar → iPhone 14 Pro (or similar).

- [ ] Top nav collapses to hamburger; **Zebby's World** doesn't wrap to two lines
- [ ] **Bottom nav** shows Home / Track / History / Zebby / Zebby+ pinned to bottom
- [ ] Active page tab is highlighted
- [ ] Logger modal is usable on mobile (chips wrap, water/sodium tiles stack)

### 11. Protected-route enforcement
- [ ] In an incognito window, visit `/tracker` directly
- [ ] You should see the Landing page (or be sent to `/login`) — never the tracker
- [ ] Visit `/api/symptoms` directly → JSON `{"message":"Unauthorized"}` with HTTP 401

### 12. Health endpoints
- [ ] `curl http://localhost:5000/api/health` → `{"status":"ok"...}`
- [ ] `curl http://localhost:5000/api/billing/health` → JSON, `mode: "test"` when no Stripe keys

## Build

- [ ] `npm run build` finishes without errors
- [ ] `dist/public/` contains hashed JS + CSS + the Zebby PNG
- [ ] `dist/index.js` is the bundled server (≈ 525KB)

## Production smoke

```bash
NODE_ENV=production SESSION_INSECURE=true \
DATABASE_URL=pglite://.data/pglite-prod \
SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
PORT=5001 \
node dist/index.js
```

- [ ] Boot logs show "serving on port 5001" with `env=production`
- [ ] `curl http://localhost:5001/api/health` → 200
- [ ] Signup via the prod port also works (cookie persists across requests)

## Known graceful-fallback behaviors

| Missing env | Behavior |
|---|---|
| `OPENAI_API_KEY` | Ask Zebby + AI reflections return canned warm replies labelled "offline reply"; RAG endpoints return clear errors instead of crashing |
| `STRIPE_*` | Billing endpoints return `test_mode: true`; Upgrade buttons toast politely without crashing |
| `FIREBASE_*` | Mobile token verification disabled; web auth unaffected |
| `SHOPIFY_*` | Pouch shows Zebby's curated cards; live storefront list is empty |
| `OPENWEATHER_API_KEY` | Symptom logs save without weather context |

If you see a real crash that isn't caused by missing keys, capture the
console error and the request URL — that's the bug to file.
