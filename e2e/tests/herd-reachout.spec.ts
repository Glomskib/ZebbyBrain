import { test, expect } from '@playwright/test';
import { devLogin } from '../utils/testLogin';

test.describe('Herd Reach-Out E2E', () => {
  let ownerEmail: string;
  let memberEmail: string;

  test.beforeEach(async ({ page }) => {
    // Use unique emails for each test run to avoid conflicts
    const timestamp = Date.now();
    ownerEmail = `herd-owner-${timestamp}@zebby.local`;
    memberEmail = `herd-member-${timestamp}@zebby.local`;

    // Login as owner and set up circle
    await page.goto('/');
    await devLogin(page, ownerEmail);
    
    // Create owner's profile if needed
    const base = process.env.E2E_BASE_URL || 'http://localhost:5000';
    await page.request.patch(`${base}/api/user/profile`, {
      data: {
        firstName: 'Owner',
        lastName: 'Test',
        dateOfBirth: '1990-01-01'
      }
    });
    
    // Create member user
    await devLogin(page, memberEmail);
    await page.request.patch(`${base}/api/user/profile`, {
      data: {
        firstName: 'Member',
        lastName: 'Test',
        dateOfBirth: '1990-01-01'
      }
    });
    
    // Switch back to owner
    await devLogin(page, ownerEmail);
    
    // Navigate to Personal Circle
    await page.goto('/personal-circle');
    await page.waitForLoadState('networkidle');
    
    // Invite member
    const inviteBtn = page.getByTestId('button-invite-member');
    if (await inviteBtn.isVisible()) {
      await inviteBtn.click();
      
      await page.getByTestId('input-member-email').fill(memberEmail);
      await page.getByTestId('select-member-role').click();
      await page.getByRole('option', { name: /support|friend|family/i }).first().click();
      await page.getByTestId('button-send-invitation').click();
      await page.waitForTimeout(1000);
    }
    
    // Accept invitation as member
    const inviteResponse = await page.request.get(`${base}/api/circles/invitations`);
    const invites = await inviteResponse.json();
    if (invites.length > 0) {
      const inviteToken = invites[0].token;
      await page.request.post(`${base}/api/circles/accept`, {
        data: { token: inviteToken }
      });
    }
    
    // Navigate to dashboard for reach-out
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Trigger reach-out, see pending banner with countdown and cancel button', async ({ page }) => {
    // Click reach-out button
    await page.getByTestId('button-reach-out').click();
    await expect(page.getByTestId('dialog-reach-out')).toBeVisible({ timeout: 5000 });
    
    // Select member
    const memberCheckbox = page.getByTestId(/^checkbox-member-/).first();
    await memberCheckbox.check();
    
    // Add optional message
    await page.getByTestId('textarea-reach-out-message').fill('E2E test reach-out');
    
    // Send request
    await page.getByTestId('button-send-reach-out').click();
    await page.waitForTimeout(1000);
    
    // Verify pending alert with countdown
    await expect(page.getByTestId('alert-pending')).toBeVisible({ timeout: 5000 });
    
    // Should see countdown in MM:SS format
    await expect(page.getByText(/\d{1,2}:\d{2}/)).toBeVisible();
    
    // Verify cancel button is present
    await expect(page.getByTestId('button-cancel-pending')).toBeVisible();
  });

  test('Cancel within window, verify no send and audit shows canceled', async ({ page }) => {
    const base = process.env.E2E_BASE_URL || 'http://localhost:5000';
    
    // Trigger reach-out
    await page.getByTestId('button-reach-out').click();
    await expect(page.getByTestId('dialog-reach-out')).toBeVisible({ timeout: 5000 });
    
    const memberCheckbox = page.getByTestId(/^checkbox-member-/).first();
    await memberCheckbox.check();
    await page.getByTestId('button-send-reach-out').click();
    await page.waitForTimeout(1000);
    
    // Wait for pending alert
    await expect(page.getByTestId('alert-pending')).toBeVisible({ timeout: 5000 });
    
    // Click cancel button
    await page.getByTestId('button-cancel-pending').click();
    await page.waitForTimeout(1000);
    
    // Verify success toast or dialog close
    await expect(page.getByTestId('dialog-reach-out')).not.toBeVisible({ timeout: 3000 });
    
    // Check audit log via API
    const auditResponse = await page.request.get(`${base}/api/herd/audit`);
    expect(auditResponse.ok()).toBeTruthy();
    
    const auditData = await auditResponse.json();
    expect(auditData.audit).toBeDefined();
    
    // Should have at least one canceled entry
    const canceledEntry = auditData.audit.find((entry: any) => entry.status === 'canceled');
    expect(canceledEntry).toBeDefined();
  });

  test('Trigger reach-out, process alerts, verify audit shows sent', async ({ page }) => {
    const base = process.env.E2E_BASE_URL || 'http://localhost:5000';
    
    // Trigger reach-out
    await page.getByTestId('button-reach-out').click();
    await expect(page.getByTestId('dialog-reach-out')).toBeVisible({ timeout: 5000 });
    
    const memberCheckbox = page.getByTestId(/^checkbox-member-/).first();
    await memberCheckbox.check();
    await page.getByTestId('textarea-reach-out-message').fill('E2E test - should send');
    await page.getByTestId('button-send-reach-out').click();
    await page.waitForTimeout(1000);
    
    // Wait for pending alert
    await expect(page.getByTestId('alert-pending')).toBeVisible({ timeout: 5000 });
    
    // Manually set window to have expired (mock the timestamp in DB)
    // Or use the dev route to process alerts
    const processResponse = await page.request.post(`${base}/api/auth/e2e/process-herd-alerts`, {
      headers: {
        'x-test-login-password': process.env.TEST_LOGIN_PASSWORD || 'letmein'
      }
    });
    expect(processResponse.ok()).toBeTruthy();
    
    await page.waitForTimeout(2000);
    
    // Check audit log - should show sent
    const auditResponse = await page.request.get(`${base}/api/herd/audit`);
    expect(auditResponse.ok()).toBeTruthy();
    
    const auditData = await auditResponse.json();
    const sentEntry = auditData.audit.find((entry: any) => entry.status === 'sent');
    expect(sentEntry).toBeDefined();
  });

  test('Exceed rate limit (4th within hour) shows 429 and UI error', async ({ page }) => {
    const base = process.env.E2E_BASE_URL || 'http://localhost:5000';
    
    // Send 3 reach-outs (the limit)
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('button-reach-out').click();
      await expect(page.getByTestId('dialog-reach-out')).toBeVisible({ timeout: 5000 });
      
      const memberCheckbox = page.getByTestId(/^checkbox-member-/).first();
      await memberCheckbox.check();
      await page.getByTestId('button-send-reach-out').click();
      await page.waitForTimeout(1000);
      
      // Close dialog
      if (await page.getByTestId('button-close-pending').isVisible()) {
        await page.getByTestId('button-close-pending').click();
      }
      await page.waitForTimeout(500);
    }
    
    // Try 4th reach-out - should hit rate limit
    await page.getByTestId('button-reach-out').click();
    await expect(page.getByTestId('dialog-reach-out')).toBeVisible({ timeout: 5000 });
    
    const memberCheckbox = page.getByTestId(/^checkbox-member-/).first();
    await memberCheckbox.check();
    await page.getByTestId('button-send-reach-out').click();
    await page.waitForTimeout(1000);
    
    // Should see rate limit error alert
    await expect(page.getByTestId('alert-rate-limit')).toBeVisible({ timeout: 5000 });
    
    // Verify error message mentions the limit
    await expect(page.getByText(/reached the limit|3.*per hour/i)).toBeVisible();
    
    // Send button should be disabled
    const sendBtn = page.getByTestId('button-send-reach-out');
    await expect(sendBtn).toBeDisabled();
  });

  test('Verify all endpoints return Cache-Control: no-store', async ({ page, request }) => {
    const base = process.env.E2E_BASE_URL || 'http://localhost:5000';
    
    // Test reach-out endpoint
    const reachoutResponse = await request.post(`${base}/api/herd/reach-out`, {
      data: {
        recipients: ['fake-user-id'],
        message: 'test'
      }
    });
    
    const reachoutHeaders = reachoutResponse.headers();
    expect(reachoutHeaders['cache-control']).toContain('no-store');
    
    // Test pending endpoint
    const pendingResponse = await request.get(`${base}/api/herd/pending`);
    const pendingHeaders = pendingResponse.headers();
    expect(pendingHeaders['cache-control']).toContain('no-store');
    
    // Test audit endpoint
    const auditResponse = await request.get(`${base}/api/herd/audit`);
    const auditHeaders = auditResponse.headers();
    expect(auditHeaders['cache-control']).toContain('no-store');
  });
});
