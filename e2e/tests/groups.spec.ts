import { test, expect } from '@playwright/test';
import { devLogin } from '../utils/testLogin';

test.describe('Groups E2E', () => {
  test.beforeEach(async ({ page }) => {
    const base = process.env.E2E_BASE_URL || 'http://localhost:5000';
    await page.request.post(`${base}/e2e/seed`);
  });

  test('Join eligible group, post, react, comment, report', async ({ page }) => {
    await page.goto('/');
    await devLogin(page, 'referee+e2e@zebby.local');

    // Navigate to groups directory
    await page.goto('/groups');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/young zebras|zebras in bloom|heds|pots/i)).toBeVisible({ timeout: 10000 });

    // Find and join first eligible group (should be auto-approved for public groups)
    const groupCard = page.locator('[data-testid^="card-group-"]').first();
    await groupCard.scrollIntoViewIfNeeded();
    
    // Click to view the group
    const viewBtn = groupCard.getByRole('link', { name: /view|open/i });
    await viewBtn.click();
    await page.waitForLoadState('networkidle');

    // If not a member, join the group
    const joinBtn = page.getByRole('button', { name: /join/i }).first();
    if (await joinBtn.isVisible()) {
      await joinBtn.click();
      await page.waitForTimeout(1000);
    }

    // Post using composer
    const postArea = page.getByPlaceholder(/share something|what's on your mind/i);
    await expect(postArea).toBeVisible({ timeout: 5000 });
    await postArea.click();
    await postArea.fill('E2E post: hi herd!');
    
    // Submit with keyboard shortcut
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+Enter' : 'Control+Enter');
    
    await expect(page.getByText('E2E post: hi herd!')).toBeVisible({ timeout: 5000 });

    // React with heart emoji (idempotent toggle)
    const heartBtn = page.locator('[data-testid^="reaction-heart-"]').first();
    await heartBtn.click();
    await page.waitForTimeout(500);
    
    // Toggle again (should work idempotently)
    await heartBtn.click();
    await page.waitForTimeout(500);
    
    // React with thumbs up
    const thumbsBtn = page.locator('[data-testid^="reaction-thumbsup-"]').first();
    await thumbsBtn.click();
    await page.waitForTimeout(500);

    // Comment on the post
    const commentBox = page.getByPlaceholder(/add a comment/i).first();
    await commentBox.scrollIntoViewIfNeeded();
    await commentBox.click();
    await commentBox.fill('E2E comment!');
    await page.keyboard.press(isMac ? 'Meta+Enter' : 'Control+Enter');
    
    await expect(page.getByText('E2E comment!')).toBeVisible({ timeout: 5000 });

    // Report the post (open dialog, pick reason, submit)
    const reportBtn = page.getByRole('button', { name: /report/i }).first();
    await reportBtn.scrollIntoViewIfNeeded();
    await reportBtn.click();
    
    // Wait for dialog and select spam reason
    const spamRadio = page.getByRole('radio', { name: /spam/i });
    await expect(spamRadio).toBeVisible({ timeout: 3000 });
    await spamRadio.check();
    
    // Submit report
    const submitBtn = page.getByRole('button', { name: /submit report/i });
    await submitBtn.click();
    
    // Verify success message
    await expect(page.getByText(/thanks|review|received/i)).toBeVisible({ timeout: 3000 });
  });
});
