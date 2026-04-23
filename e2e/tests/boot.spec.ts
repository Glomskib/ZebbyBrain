import { test, expect } from "@playwright/test";

test("browser boot + landing load", async ({ page }) => {
  console.log("goto /");
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 30_000 });
  console.log("DOM ready");
  // wait for React hydration + CSS injection
  await page.waitForSelector("main, [data-testid='logo-link'], h1", { timeout: 10_000 });
  console.log("has main/h1");
  await page.screenshot({ path: "/tmp/zebby-smoke/boot.png", fullPage: true });
  const title = await page.title();
  console.log("title:", title);
  expect(title).toMatch(/Zebby|Replit|Health/i);
});
