/**
 * Browser smoke test: walks every core flow against the running dev server,
 * captures console errors and failed network requests per page, and saves
 * screenshots to /tmp/zebby-smoke/.
 *
 * Run: npx playwright test e2e/tests/smoke.spec.ts --project=chromium
 */
import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "/tmp/zebby-smoke";
fs.mkdirSync(OUT_DIR, { recursive: true });

type Problem = { kind: "console" | "pageerror" | "response"; route: string; detail: string };
const problems: Problem[] = [];

function attachListeners(page: Page, route: string) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Filter Vite HMR WebSocket close noise and favicon 404s which are
      // unrelated to app correctness.
      if (/WebSocket connection to .* failed|favicon\.ico/.test(text)) return;
      // Dev rate-limit bumping the auth poller isn't a real user problem.
      if (/429 \(Too Many Requests\)/.test(text)) return;
      problems.push({ kind: "console", route, detail: text });
    }
  });
  page.on("pageerror", (err) => {
    problems.push({ kind: "pageerror", route, detail: err.message });
  });
  page.on("response", async (res) => {
    if (res.status() >= 500) {
      problems.push({
        kind: "response",
        route,
        detail: `${res.status()} ${res.url()}`,
      });
    }
  });
}

async function waitReady(page: Page) {
  // Vite injects CSS via JS; avoid networkidle (HMR WS keeps net busy).
  // Wait for Tailwind styles to be computed by checking a sentinel.
  await page
    .waitForFunction(
      () => {
        const bg = getComputedStyle(document.body).backgroundColor;
        const ok = bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
        // If an avatar img is present, confirm w-32 (128px) is applied and the
        // rendered box is NOT the PNG's natural size.
        const sample = document.querySelector(
          'img[alt*="Zebby"]',
        ) as HTMLImageElement | null;
        if (sample && sample.naturalWidth > 0) {
          const rect = sample.getBoundingClientRect();
          if (rect.width >= sample.naturalWidth) return false;
        }
        return ok;
      },
      { timeout: 8000 },
    )
    .catch(() => {});
  // tiny settle
  await page.waitForTimeout(150);
}

async function shot(page: Page, name: string) {
  await waitReady(page);
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage: true,
  });
}

async function goto(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitReady(page);
}

test.describe.configure({ mode: "serial" });

test("full user journey: signup → onboarding → dashboard → tracker → history → chat → zebby+ → calm → doctor-prep", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // ---- landing / login ------------------------------------------------
  attachListeners(page, "landing");
  await goto(page, "/");
  await shot(page, "01-landing");
  await expect(page.getByRole("heading", { name: "Zebby's World", level: 1 })).toBeVisible();

  attachListeners(page, "login");
  await goto(page, "/login");
  await shot(page, "02-login-blank");

  // ---- signup ---------------------------------------------------------
  attachListeners(page, "signup");
  await page.getByRole("tab", { name: /sign up/i }).click();
  const email = `smoke_${Date.now()}@zebby.local`;
  await page.fill('[data-testid="input-signup-first"]', "Smoke");
  await page.fill('[data-testid="input-signup-last"]', "Test");
  await page.fill('[data-testid="input-signup-email"]', email);
  await page.fill('[data-testid="input-signup-password"]', "zebratest1");
  await page.fill('[data-testid="input-signup-confirm"]', "zebratest1");
  await shot(page, "03-signup-filled");
  await page.click('[data-testid="button-signup-submit"]');

  // Should redirect to /onboarding
  await page.waitForURL(/\/onboarding/, { timeout: 15_000 });
  attachListeners(page, "onboarding");
  await shot(page, "04-onboarding-welcome");

  // ---- walk onboarding steps -----------------------------------------
  // Welcome step — "Continue"
  await page.click('[data-testid="button-next"]');
  await page.waitForTimeout(250);
  // About EDS
  await page.click('[data-testid="button-next"]');
  await page.waitForTimeout(250);
  // Your EDS: pick hEDS + experience
  await page.click('label[for="hEDS"]');
  await page.click('label[for="learning_to_manage"]');
  await page.click('[data-testid="button-next"]');
  await page.waitForTimeout(250);
  // Avatar + name step
  await expect(page.locator('[data-testid="avatar-zebby_sparkle"]')).toBeVisible();
  await page.click('[data-testid="avatar-zebby_sparkle"]');
  await shot(page, "05-onboarding-avatar");
  await page.click('[data-testid="button-next"]');
  await page.waitForTimeout(250);
  // Symptoms
  await page.click('[data-testid="checkbox-joint-pain"]');
  await page.click('[data-testid="checkbox-pots"]');
  await page.click('[data-testid="button-next"]');
  await page.waitForTimeout(250);
  // Goals
  await page.click('[data-testid="checkbox-track-my-symptoms"]');
  await page.click('[data-testid="button-next"]');
  await page.waitForTimeout(250);
  // Complete
  await shot(page, "06-onboarding-complete");
  await page.click('[data-testid="button-next"]');

  // ---- dashboard ------------------------------------------------------
  await page.waitForURL("**/", { timeout: 15_000 });
  // give React Query a beat to refetch /api/auth/user so avatar renders
  await page.waitForTimeout(500);
  attachListeners(page, "dashboard");
  await expect(page.locator('[data-testid="text-welcome"]')).toBeVisible();
  // Confirm sparkle variant actually rendered on the hero
  await expect(
    page.locator('[data-avatar-key="zebby_sparkle"]').first(),
  ).toBeVisible({ timeout: 5_000 });
  await shot(page, "07-dashboard");

  // ---- tracker: log a symptom via the in-app logger -------------------
  attachListeners(page, "tracker");
  await goto(page, "/tracker");
  
  await shot(page, "08-tracker-empty");

  // The tracker has a "New entry" button — open the logger.
  const newEntry = page.locator('[data-testid="button-new-log"], [data-testid="button-first-log"]').first();
  if (await newEntry.isVisible().catch(() => false)) {
    await newEntry.click();
    await page.waitForTimeout(500);
    await shot(page, "09-tracker-logger-open");
    // Try closing the dialog via Escape — we don't want this test to block
    // on the logger's internal form which is complex. We'll log via API so
    // history has data.
    await page.keyboard.press("Escape");
  }

  // Log two entries via the API so history + insights have data
  for (const i of [0, 1]) {
    const ts = new Date(Date.now() - i * 86400000).toISOString();
    const resp = await page.request.post("/api/symptoms", {
      data: {
        symptomEntries: [
          { symptomName: "Joint Pain", intensity: 4 + i, bodyPart: "knee" },
          { symptomName: "Fatigue", intensity: 5 + i },
        ],
        timestamp: ts,
      },
    });
    expect(resp.ok()).toBeTruthy();
  }

  // ---- history --------------------------------------------------------
  attachListeners(page, "history");
  await goto(page, "/history");
  
  await shot(page, "10-history");
  await expect(page.locator("text=/Entries logged|Avg intensity|Top symptom/").first()).toBeVisible();

  // ---- ask-zebby (SimpleChat) -----------------------------------------
  attachListeners(page, "ask-zebby");
  await goto(page, "/ask-zebby");
  
  await shot(page, "11-ask-zebby-empty");
  // Welcome message visible
  await expect(page.locator('text=/Tell me how today/')).toBeVisible();
  // Send a question via quick-prompt chip
  const prompt = page.locator('[data-testid^="chat-prompt-"]').first();
  await prompt.click();
  // Wait for Zebby reply (fallback is synchronous server-side)
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-testid="chat-turn-zebby"]').length >= 2,
    { timeout: 10_000 },
  );
  await shot(page, "12-ask-zebby-reply");

  // ---- zebby+ ---------------------------------------------------------
  attachListeners(page, "zebby-plus");
  await goto(page, "/zebby-plus");
  
  await expect(page.locator("text=Zebby+").first()).toBeVisible();
  await shot(page, "13-zebby-plus");

  // ---- calm corner ----------------------------------------------------
  attachListeners(page, "calm-corner");
  await goto(page, "/calm-corner");
  
  await expect(page.locator("text=/grounding|Box breathing/i").first()).toBeVisible();
  await shot(page, "14-calm-corner");

  // ---- doctor prep: generate + download ------------------------------
  attachListeners(page, "doctor-prep");
  await goto(page, "/doctor-prep");
  // Free user sees the PlusOnly gate
  await shot(page, "15-doctor-prep-free");
  await expect(page.locator("text=See what's in Zebby+").first()).toBeVisible();

  // Elevate to plus via dev-only endpoint, then reload and verify the full UI + download
  const upgrade = await page.request.post("/api/auth/e2e/upgrade-self-to-plus");
  expect(upgrade.ok()).toBeTruthy();
  await page.evaluate(() => {
    (window as any).__rqClient?.invalidateQueries?.();
  });
  await goto(page, "/doctor-prep");
  await page.reload(); // force useAuth refresh
  await waitReady(page);
  await shot(page, "15b-doctor-prep-plus");
  // Summary should be visible (rendered from server data)
  await expect(page.locator("text=Your summary")).toBeVisible({ timeout: 8_000 });
  // Fill in concerns + questions, then trigger the download
  await page
    .locator("textarea")
    .first()
    .fill("Pain in right knee on stairs, new migraines 3x/week.");
  await page
    .locator("textarea")
    .nth(1)
    .fill("Should I see cardiology for POTS? Compression sleeves?");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10_000 }),
    page.getByRole("button", { name: /Download brief/i }).click(),
  ]);
  const dlPath = path.join(OUT_DIR, "doctor-prep.txt");
  await download.saveAs(dlPath);
  const dlSize = fs.statSync(dlPath).size;
  expect(dlSize).toBeGreaterThan(80);
  await shot(page, "15c-doctor-prep-after-download");

  // ---- expansion routes reachable -----------------------------------
  for (const route of ["/zzzebby-sounds", "/trusted-trail", "/herd-insights"]) {
    attachListeners(page, route);
    await goto(page, route);
    
    await shot(page, `16-${route.replace(/\W/g, "-")}`);
  }

  // ---- mobile layout check ------------------------------------------
  await context.close();
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileCtx.newPage();
  attachListeners(mobilePage, "mobile-login");
  // Sign in as the user we just created
  await goto(mobilePage, "/login");
  await mobilePage.fill('[data-testid="input-login-email"]', email);
  await mobilePage.fill('[data-testid="input-login-password"]', "zebratest1");
  await mobilePage.click('[data-testid="button-login-submit"]');
  await mobilePage.waitForURL(/\/$|\/onboarding/, { timeout: 15_000 });
  await mobilePage.waitForTimeout(500);
  attachListeners(mobilePage, "mobile-dashboard");
  await shot(mobilePage, "17-mobile-dashboard");
  // Bottom nav should be present at mobile width
  await expect(mobilePage.locator('[data-testid="mobile-bottom-nav"]')).toBeVisible();
  await shot(mobilePage, "18-mobile-with-bottomnav");

  // ---- write problems report ---------------------------------------
  fs.writeFileSync(
    path.join(OUT_DIR, "problems.json"),
    JSON.stringify(problems, null, 2),
  );
  console.log("Smoke test problems:", problems.length);
  for (const p of problems) console.log(`  [${p.kind}] ${p.route}: ${p.detail}`);

  await mobileCtx.close();
});
