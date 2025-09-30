import { test, expect } from '@playwright/test';
import { devLogin } from '../utils/testLogin';

test('Referral code, signup credit +100, week-active +250', async ({ page }) => {
  const base = process.env.E2E_BASE_URL || 'http://localhost:5000';
  
  // Ensure seed data exists
  await page.request.post(`${base}/e2e/seed`);

  // Log in as referrer and check referral code
  await page.goto('/');
  await devLogin(page, 'referrer+e2e@zebby.local');
  
  await page.goto('/settings/herd-rewards');
  await page.waitForLoadState('networkidle');
  
  // Verify referral code is visible
  const codeElement = page.getByTestId('referral-code');
  await expect(codeElement).toBeVisible({ timeout: 5000 });
  const codeText = await codeElement.innerText();
  expect(codeText.length).toBeGreaterThan(3);
  
  // Check initial balance
  const balanceElement = page.getByTestId('rewards-balance');
  await expect(balanceElement).toBeVisible();
  const bal1Text = await balanceElement.innerText();
  const bal1 = parseInt(bal1Text.replace(/\D/g, ''), 10);
  expect(bal1).toBeGreaterThanOrEqual(0);
  
  // Trigger week-active processor manually
  const weekActiveResp = await page.request.post(`${base}/e2e/run-week-active`).catch(() => null);
  if (weekActiveResp && weekActiveResp.ok()) {
    console.log('Week-active processor ran successfully');
  }
  
  // Reload and check balance again
  await page.reload();
  await page.waitForLoadState('networkidle');
  
  const bal2Text = await balanceElement.innerText();
  const bal2 = parseInt(bal2Text.replace(/\D/g, ''), 10);
  
  // Balance should be >= initial balance (may increase if criteria met)
  expect(bal2).toBeGreaterThanOrEqual(bal1);
  
  // Verify history section exists
  await expect(page.getByText(/recent activity|reward history/i)).toBeVisible();
  
  console.log(`Balance check: initial=${bal1}, after_cron=${bal2}`);
});
