/**
 * Exercise the symptom tracker's new mood/activity/diet + water/salt quick-log
 * fields end-to-end in a real browser.
 */
import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "/tmp/zebby-smoke";
fs.mkdirSync(OUT_DIR, { recursive: true });

async function waitReady(page: Page) {
  await page
    .waitForFunction(() => {
      const bg = getComputedStyle(document.body).backgroundColor;
      const ok = bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
      const sample = document.querySelector('img[alt*="Zebby"]') as HTMLImageElement | null;
      if (sample && sample.naturalWidth > 0) {
        if (sample.getBoundingClientRect().width >= sample.naturalWidth) return false;
      }
      return ok;
    }, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(200);
}
async function goto(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitReady(page);
}

test("tracker: mood/activity/diet + water/salt quick-log + entry saves", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const email = `tracker_${Date.now()}@zebby.local`;

  // signup
  await goto(page, "/signup");
  await page.getByRole("tab", { name: /sign up/i }).click();
  await page.fill('[data-testid="input-signup-first"]', "Tracker");
  await page.fill('[data-testid="input-signup-last"]', "QA");
  await page.fill('[data-testid="input-signup-email"]', email);
  await page.fill('[data-testid="input-signup-password"]', "zebratest1");
  await page.fill('[data-testid="input-signup-confirm"]', "zebratest1");
  await page.click('[data-testid="button-signup-submit"]');
  await page.waitForURL(/\/onboarding/);

  // skip through onboarding quickly
  for (let i = 0; i < 2; i++) {
    await page.click('[data-testid="button-next"]');
    await page.waitForTimeout(150);
  }
  await page.click('label[for="hEDS"]');
  await page.click('label[for="new_to_eds"]');
  await page.click('[data-testid="button-next"]'); // advance past "Your EDS"
  await page.waitForTimeout(200);
  await page.click('[data-testid="avatar-zebby_brave"]');
  await page.click('[data-testid="button-next"]'); // avatar
  await page.waitForTimeout(200);
  await page.click('[data-testid="button-next"]'); // symptoms (skip)
  await page.waitForTimeout(200);
  await page.click('[data-testid="button-next"]'); // goals (skip)
  await page.waitForTimeout(200);
  await page.click('[data-testid="button-next"]'); // complete
  await page.waitForURL("**/");
  await page.waitForTimeout(500);

  // open tracker → the logger modal
  await goto(page, "/tracker");
  await page.screenshot({ path: path.join(OUT_DIR, "trk-01-tracker-landing.png"), fullPage: true });
  await page.locator('[data-testid="button-new-log"], [data-testid="button-first-log"]').first().click();
  await page.waitForSelector('[data-testid="button-close-logger"]', { timeout: 10_000 });
  await page.screenshot({ path: path.join(OUT_DIR, "trk-02-logger-open.png"), fullPage: true });

  // pick two symptoms — their data-testid uses slug form like "button-add-joint-pain"
  // Instead of guessing the test-id, click the first symptom card by text.
  await page.getByRole("button", { name: /Joint Pain/i }).first().click();
  await page.getByRole("button", { name: /Fatigue/i }).first().click();
  await page.waitForTimeout(250);

  // chips should now be visible
  await expect(page.locator('[data-testid="chip-mood-anxious"]')).toBeVisible();
  await page.click('[data-testid="chip-mood-anxious"]');
  await page.click('[data-testid="chip-activity-overdid-it"]');
  await page.click('[data-testid="chip-diet-salty"]');

  // quick-log water + sodium
  await page.click('[data-testid="button-water-500"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="button-sodium-500"]');
  await page.waitForTimeout(300);
  // The "Water · Nml today" text should update
  await expect(page.locator("text=/Water · 500ml today/").first()).toBeVisible({ timeout: 4000 });
  await expect(page.locator("text=/Sodium · 500mg today/").first()).toBeVisible({ timeout: 4000 });

  await page.screenshot({ path: path.join(OUT_DIR, "trk-03-logger-filled.png"), fullPage: true });

  // session notes
  const sessionNotes = page.getByPlaceholder(/Any additional context/i);
  await sessionNotes.fill("Stairs set off knee. POTS brain foggy too.");

  // submit
  await page.getByRole("button", { name: /^Log Symptoms$|Log symptom|Save/i }).last().click();

  // Wait for the logger to close (toast success) and list to refresh
  await page.waitForSelector('[data-testid="button-close-logger"]', {
    state: "hidden",
    timeout: 15_000,
  });
  await page.waitForTimeout(500);

  // Check the backend now has a log for this user
  const r = await page.request.get("/api/symptoms");
  const logs = await r.json();
  expect(Array.isArray(logs)).toBeTruthy();
  expect(logs.length).toBeGreaterThan(0);
  const last = logs[0];
  expect(last.notes).toMatch(/Mood: anxious/);
  expect(last.notes).toMatch(/Activity: overdid it/);
  expect(last.notes).toMatch(/Diet: salty/);
  // water + sodium captured
  expect(last.waterIntakeCurrentMl).toBeGreaterThanOrEqual(500);
  expect(last.sodiumIntakeCurrentMg).toBeGreaterThanOrEqual(500);

  // daily-intakes should reflect the POSTs
  const di = await (await page.request.get("/api/daily-intakes")).json();
  expect(di.waterMl).toBeGreaterThanOrEqual(500);
  expect(di.sodiumMg).toBeGreaterThanOrEqual(500);

  // history should show the entries
  await goto(page, "/history");
  await page.screenshot({ path: path.join(OUT_DIR, "trk-04-history.png"), fullPage: true });
  await expect(page.locator("text=Entries logged").first()).toBeVisible();

  await ctx.close();
});
