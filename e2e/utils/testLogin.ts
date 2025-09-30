import { Page } from '@playwright/test';

export async function devLogin(page: Page, email: string) {
  const base = process.env.E2E_BASE_URL || 'http://localhost:5000';
  const pw = process.env.TEST_LOGIN_PASSWORD || 'letmein';
  
  const response = await page.request.post(`${base}/api/auth/test-login`, {
    headers: { 
      'x-test-login-password': pw, 
      'content-type': 'application/json' 
    },
    data: { email }
  });
  
  const json = await response.json();
  
  if (!json.success || !json.user) {
    throw new Error(`Test login failed: ${JSON.stringify(json)}`);
  }
  
  await page.context().addCookies([
    {
      name: 'connect.sid',
      value: json.sessionId || 'test-session',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }
  ]);
  
  await page.goto(base);
  await page.waitForTimeout(500);
}
